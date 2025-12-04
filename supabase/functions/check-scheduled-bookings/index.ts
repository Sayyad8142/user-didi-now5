// ============================================================================
// Check Scheduled Bookings - Sends FCM alerts 10-20 mins before scheduled time
// Uses the SAME fcm_tokens table as instant bookings for consistency
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WINDOW_MINUTES = 20; // Alert workers within 20 mins of scheduled time

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🕐 check-scheduled-bookings: Starting at', new Date().toISOString());

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch scheduled bookings that need pre-alert
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_type', 'scheduled')
      .eq('status', 'pending')
      .eq('prealert_sent', false)
      .not('scheduled_date', 'is', null)
      .not('scheduled_time', 'is', null);

    if (bookingsError) {
      console.error('❌ Error fetching bookings:', bookingsError);
      return new Response(JSON.stringify({ ok: false, error: bookingsError.message }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!bookings?.length) {
      console.log('📭 No scheduled bookings pending pre-alert');
      return new Response(JSON.stringify({ ok: true, processed: 0 }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📋 Found ${bookings.length} scheduled bookings to check`);

    const nowUTC = new Date();
    const results: any[] = [];

    for (const booking of bookings) {
      const scheduledDateStr = booking.scheduled_date;
      const scheduledTimeStr = booking.scheduled_time?.slice(0, 5) || '00:00';
      
      // Build IST timestamp (India is UTC+5:30)
      const scheduledAtIST = new Date(`${scheduledDateStr}T${scheduledTimeStr}:00+05:30`);
      const diffMs = scheduledAtIST.getTime() - nowUTC.getTime();
      const diffMin = diffMs / 60000;

      console.log(`📅 Booking ${booking.id}: scheduled=${scheduledAtIST.toISOString()}, diff=${diffMin.toFixed(1)}min, community=${booking.community}, service=${booking.service_type}`);

      // Fire alerts when within WINDOW_MINUTES (20 mins) of scheduled time
      if (diffMin <= WINDOW_MINUTES && diffMin > -5) {
        console.log(`🔔 Booking ${booking.id} is due in ${diffMin.toFixed(1)} mins - SENDING ALERTS!`);

        // UNIFIED: Query fcm_tokens table joined with workers (SAME as instant flow)
        // This ensures scheduled bookings use the same FCM token source as instant bookings
        const { data: workerTokens, error: tokensError } = await supabase
          .from('fcm_tokens')
          .select(`
            token,
            user_id,
            workers!inner(
              id,
              full_name,
              is_active,
              is_available,
              service_types,
              community,
              communities
            )
          `)
          .eq('workers.is_active', true)
          .eq('workers.is_available', true);

        if (tokensError) {
          console.error(`❌ Error fetching worker tokens:`, tokensError);
          continue;
        }

        console.log(`👷 Found ${workerTokens?.length || 0} active workers with FCM tokens`);

        // Filter by service type and community match
        const eligibleWorkers = (workerTokens || []).filter((wt: any) => {
          const worker = wt.workers;
          if (!worker) return false;
          
          // Check service type match
          const serviceTypes = worker.service_types || [];
          const matchesService = serviceTypes.includes(booking.service_type);
          
          // Check community match (empty array = matches all communities)
          const communitiesArray = worker.communities || [];
          const matchesCommunities = communitiesArray.length === 0 || 
                                     communitiesArray.includes(booking.community);
          const matchesCommunity = worker.community === booking.community || !worker.community;
          
          const matches = matchesService && (matchesCommunities || matchesCommunity);
          
          console.log(`  Worker ${worker.id} (${worker.full_name}): service=${matchesService}, community=${matchesCommunities || matchesCommunity}, eligible=${matches}`);
          
          return matches;
        });

        console.log(`✅ ${eligibleWorkers.length} eligible workers for booking ${booking.id}`);

        let workersNotified = 0;
        let fcmSuccessCount = 0;

        for (const wt of eligibleWorkers) {
          const worker = wt.workers;
          try {
            console.log(`📤 Sending FCM to ${worker.full_name} (${worker.id}), token: ${wt.token?.substring(0, 20)}...`);
            
            // Call the SAME send-worker-fcm edge function used by instant bookings
            const fcmResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-worker-fcm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                token: wt.token,
                title: 'Scheduled Booking',
                body: `${booking.service_type} • ${booking.community} • Flat ${booking.flat_no || ''}`,
                data: {
                  type: 'BOOKING_ALERT',
                  booking_id: booking.id,
                  service_type: booking.service_type,
                  community: booking.community,
                  flat_no: booking.flat_no || '',
                  customer_name: booking.cust_name || '',
                  scheduled_time: scheduledTimeStr,
                },
              }),
            });

            const fcmResult = await fcmResponse.json();
            
            if (fcmResponse.ok && fcmResult.ok) {
              workersNotified++;
              fcmSuccessCount++;
              console.log(`✅ FCM sent successfully to ${worker.full_name}`);

              // Create booking_request record
              await supabase.from('booking_requests').upsert({
                booking_id: booking.id,
                worker_id: worker.id,
                order_sequence: workersNotified,
                status: 'notified',
                offered_at: new Date().toISOString(),
                timeout_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }, { onConflict: 'booking_id,worker_id' });
            } else {
              console.error(`❌ FCM failed for ${worker.full_name}:`, fcmResult);
            }
          } catch (fcmErr) {
            console.error(`❌ Error sending FCM to ${worker.full_name}:`, fcmErr);
          }
        }

        // ONLY mark as prealert_sent if at least one worker was notified OR booking is past due
        if (fcmSuccessCount > 0 || diffMin <= -5) {
          await supabase.from('bookings')
            .update({ prealert_sent: true, updated_at: new Date().toISOString() })
            .eq('id', booking.id);
          console.log(`✅ Booking ${booking.id}: prealert_sent=true, ${workersNotified} workers notified`);
        } else {
          console.log(`⚠️ Booking ${booking.id}: FCM failed for all workers, will retry next run`);
        }

        results.push({ booking_id: booking.id, workers_notified: workersNotified, fcm_success: fcmSuccessCount });
      } else if (diffMin <= -5) {
        // Booking is more than 5 mins past due - mark as processed to avoid spam
        console.log(`⏰ Booking ${booking.id} is ${Math.abs(diffMin).toFixed(1)} mins past due, marking prealert_sent`);
        await supabase.from('bookings')
          .update({ prealert_sent: true })
          .eq('id', booking.id);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms, processed ${results.length} bookings`);

    return new Response(JSON.stringify({ ok: true, results, duration_ms: duration }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
