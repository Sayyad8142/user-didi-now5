// ============================================================================
// Check Scheduled Bookings - Sends FCM alerts 10-15 mins before scheduled time
// ============================================================================
// Called every minute by cron job. Finds scheduled bookings due soon and
// sends FCM notifications to eligible workers via send-worker-fcm function.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WINDOW_MINUTES = 15; // Alert workers 15 mins before scheduled time

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🕐 check-scheduled-bookings: Starting check at', new Date().toISOString());

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch all scheduled bookings that need pre-alert
    // Scheduled bookings that are pending, not alerted, due within WINDOW_MINUTES
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_type', 'scheduled')
      .eq('status', 'pending')
      .eq('prealert_sent', false)
      .not('scheduled_date', 'is', null)
      .not('scheduled_time', 'is', null);

    if (bookingsError) {
      console.error('❌ Error fetching scheduled bookings:', bookingsError);
      return new Response(
        JSON.stringify({ ok: false, error: bookingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bookings || bookings.length === 0) {
      console.log('📭 No scheduled bookings pending pre-alert');
      return new Response(
        JSON.stringify({ ok: true, message: 'No scheduled bookings to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${bookings.length} scheduled bookings to check`);

    const nowUTC = new Date();
    const results: any[] = [];

    for (const booking of bookings) {
      // Combine scheduled_date + scheduled_time as IST, then compare with now
      // scheduled_date is like '2024-01-15', scheduled_time is like '14:30:00'
      const scheduledDateStr = booking.scheduled_date;
      const scheduledTimeStr = booking.scheduled_time?.slice(0, 5) || '00:00'; // HH:MM
      
      // Build IST timestamp (India is UTC+5:30)
      const scheduledAtIST = new Date(`${scheduledDateStr}T${scheduledTimeStr}:00+05:30`);
      const diffMs = scheduledAtIST.getTime() - nowUTC.getTime();
      const diffMin = diffMs / 60000;

      console.log(`📅 Booking ${booking.id}: scheduled at ${scheduledAtIST.toISOString()}, diff: ${diffMin.toFixed(1)} mins`);

      // Fire alerts only when 0 < diff <= WINDOW_MINUTES (i.e., due within 15 mins)
      if (diffMin <= WINDOW_MINUTES && diffMin > 0) {
        console.log(`🔔 Booking ${booking.id} is due in ${diffMin.toFixed(1)} mins - sending alerts!`);

        // 2. Find eligible workers for this booking
        const { data: workers, error: workersError } = await supabase
          .from('workers')
          .select(`
            id,
            full_name,
            fcm_token,
            community,
            communities,
            service_types
          `)
          .eq('is_active', true)
          .eq('is_available', true)
          .contains('service_types', [booking.service_type]);

        if (workersError) {
          console.error(`❌ Error fetching workers for booking ${booking.id}:`, workersError);
          continue;
        }

        // Filter workers by community match
        const eligibleWorkers = (workers || []).filter(worker => {
          // Worker matches if:
          // - communities array is empty/null (matches all)
          // - OR communities array contains the booking's community
          // - OR community field matches
          const communitiesArray = worker.communities || [];
          const matchesCommunities = communitiesArray.length === 0 || 
                                     communitiesArray.includes(booking.community);
          const matchesCommunity = worker.community === booking.community || !worker.community;
          return matchesCommunities || matchesCommunity;
        }).filter(w => w.fcm_token); // Must have FCM token

        console.log(`👷 Found ${eligibleWorkers.length} eligible workers with FCM tokens`);

        let workersNotified = 0;

        // 3. Send FCM to each eligible worker via send-worker-fcm edge function
        for (const worker of eligibleWorkers) {
          try {
            console.log(`📤 Sending FCM to worker ${worker.id} (${worker.full_name})`);
            
            const fcmResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-worker-fcm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                token: worker.fcm_token,
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
              console.log(`✅ FCM sent to worker ${worker.id}`);

              // 4. Create booking_request record for tracking
              await supabase
                .from('booking_requests')
                .upsert({
                  booking_id: booking.id,
                  worker_id: worker.id,
                  order_sequence: workersNotified,
                  status: 'notified',
                  offered_at: new Date().toISOString(),
                  timeout_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min timeout
                }, { onConflict: 'booking_id,worker_id' });
            } else {
              console.error(`❌ FCM failed for worker ${worker.id}:`, fcmResult);
            }
          } catch (fcmErr) {
            console.error(`❌ Error sending FCM to worker ${worker.id}:`, fcmErr);
          }
        }

        // 5. Mark booking as prealert_sent so it doesn't fire again
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            prealert_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);

        if (updateError) {
          console.error(`❌ Failed to mark booking ${booking.id} as prealert_sent:`, updateError);
        } else {
          console.log(`✅ Booking ${booking.id} marked as prealert_sent, ${workersNotified} workers notified`);
        }

        results.push({
          booking_id: booking.id,
          scheduled_at: scheduledAtIST.toISOString(),
          workers_notified: workersNotified,
        });
      } else if (diffMin <= 0) {
        // Booking time has passed - mark as prealert_sent to prevent future checks
        console.log(`⏰ Booking ${booking.id} is past due (${diffMin.toFixed(1)} mins), marking as prealert_sent`);
        await supabase
          .from('bookings')
          .update({ prealert_sent: true })
          .eq('id', booking.id);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ check-scheduled-bookings completed in ${duration}ms, processed ${results.length} bookings`);

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Processed ${results.length} scheduled bookings`,
        results,
        duration_ms: duration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in check-scheduled-bookings:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
