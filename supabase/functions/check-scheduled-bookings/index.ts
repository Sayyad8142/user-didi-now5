// ============================================================================
// Check Scheduled Bookings - Sends FCM alerts 10-20 mins before scheduled time
// Uses the SAME fcm_tokens table as instant bookings for consistency
// Also sends USER REMINDERS 30 mins before their scheduled booking
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_WINDOW_MINUTES = 20; // Alert workers within 20 mins of scheduled time
const USER_REMINDER_WINDOW_MINUTES = 35; // Remind users 30-35 mins before scheduled time

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🕐 check-scheduled-bookings: Starting at', new Date().toISOString());

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch only scheduled bookings within the actionable window (today/tomorrow)
    // This avoids scanning the entire bookings table every run
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC → IST
    const todayIST = nowIST.toISOString().slice(0, 10);
    const tomorrowIST = new Date(nowIST.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Only dispatch bookings that are paid or pay_after_service
    // Skip unpaid Pay Now bookings (payment_status='pending', payment_method=null)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_type', 'scheduled')
      .eq('status', 'pending')
      .not('scheduled_date', 'is', null)
      .not('scheduled_time', 'is', null)
      .in('scheduled_date', [todayIST, tomorrowIST])
      .in('payment_status', ['paid', 'pay_after_service']);

    if (bookingsError) {
      console.error('❌ Error fetching bookings:', bookingsError);
      return new Response(JSON.stringify({ ok: false, error: bookingsError.message }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!bookings?.length) {
      console.log('📭 No scheduled bookings to process');
      return new Response(JSON.stringify({ ok: true, processed: 0 }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📋 Found ${bookings.length} scheduled bookings to check`);

    const nowUTC = new Date();
    const workerResults: any[] = [];
    const userReminderResults: any[] = [];

    for (const booking of bookings) {
      const scheduledDateStr = booking.scheduled_date;
      const scheduledTimeStr = booking.scheduled_time?.slice(0, 5) || '00:00';
      
      // Build IST timestamp (India is UTC+5:30)
      const scheduledAtIST = new Date(`${scheduledDateStr}T${scheduledTimeStr}:00+05:30`);
      const diffMs = scheduledAtIST.getTime() - nowUTC.getTime();
      const diffMin = diffMs / 60000;

      console.log(`📅 Booking ${booking.id}: scheduled=${scheduledAtIST.toISOString()}, diff=${diffMin.toFixed(1)}min, community=${booking.community}, service=${booking.service_type}`);

      // ==========================================
      // USER REMINDER: 30-35 mins before scheduled time
      // ==========================================
      const userReminderSent = booking.user_reminder_sent || false;
      
      if (!userReminderSent && diffMin <= USER_REMINDER_WINDOW_MINUTES && diffMin > 25) {
        console.log(`🔔 Sending USER REMINDER for booking ${booking.id} (${diffMin.toFixed(1)} mins before)`);
        
        try {
          const reminderResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-user-fcm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              user_id: booking.user_id,
              title: '⏰ Booking Reminder',
              body: `Your ${booking.service_type.replace('_', ' ')} is scheduled in 30 minutes!`,
              data: {
                type: 'BOOKING_REMINDER',
                booking_id: booking.id,
                service_type: booking.service_type,
                scheduled_time: scheduledTimeStr,
              },
            }),
          });

          const reminderResult = await reminderResponse.json();
          
          if (reminderResponse.ok && reminderResult.sent > 0) {
            // Mark user_reminder_sent = true
            await supabase.from('bookings')
              .update({ user_reminder_sent: true, updated_at: new Date().toISOString() })
              .eq('id', booking.id);
            
            console.log(`✅ User reminder sent for booking ${booking.id}`);
            userReminderResults.push({ booking_id: booking.id, success: true });
          } else {
            console.log(`⚠️ User reminder not sent (no tokens or failed):`, reminderResult);
            userReminderResults.push({ booking_id: booking.id, success: false, reason: 'no_tokens' });
          }
        } catch (reminderErr) {
          console.error(`❌ Error sending user reminder:`, reminderErr);
          userReminderResults.push({ booking_id: booking.id, success: false, error: reminderErr.message });
        }
      }

      // ==========================================
      // WORKER ALERTS: 10-20 mins before scheduled time
      // ==========================================
      if (!booking.prealert_sent && diffMin <= WORKER_WINDOW_MINUTES && diffMin > -5) {
        console.log(`🔔 Booking ${booking.id} is due in ${diffMin.toFixed(1)} mins - SENDING WORKER ALERTS!`);

        // Step 1: Get eligible workers (active, available, matching service type)
        const { data: workers, error: workersError } = await supabase
          .from('workers')
          .select('id, full_name, service_types, community, communities')
          .eq('is_active', true)
          .eq('is_available', true)
          .contains('service_types', [booking.service_type]);

        if (workersError) {
          console.error(`❌ Error fetching workers:`, workersError);
          continue;
        }

        console.log(`👷 Found ${workers?.length || 0} active/available workers for ${booking.service_type}`);

        // Step 2: Filter by community match
        const communityMatchedWorkers = (workers || []).filter((worker: any) => {
          const communitiesArray = worker.communities || [];
          const matchesCommunities = communitiesArray.length === 0 || 
                                     communitiesArray.includes(booking.community);
          const matchesCommunity = worker.community === booking.community || !worker.community;
          
          const matches = matchesCommunities || matchesCommunity;
          console.log(`  Worker ${worker.id} (${worker.full_name}): communities=${JSON.stringify(communitiesArray)}, booking.community=${booking.community}, eligible=${matches}`);
          
          return matches;
        });

        console.log(`🎯 ${communityMatchedWorkers.length} workers match community ${booking.community}`);

        // Step 3: Get FCM tokens for matched workers
        const workerIds = communityMatchedWorkers.map((w: any) => w.id);
        
        const { data: fcmTokens, error: tokensError } = await supabase
          .from('fcm_tokens')
          .select('user_id, token')
          .in('user_id', workerIds);

        if (tokensError) {
          console.error(`❌ Error fetching FCM tokens:`, tokensError);
          continue;
        }

        console.log(`📱 Found ${fcmTokens?.length || 0} FCM tokens for eligible workers`);

        // Step 4: Combine workers with their tokens
        const eligibleWorkers = communityMatchedWorkers
          .map((worker: any) => {
            const tokenRecord = (fcmTokens || []).find((t: any) => t.user_id === worker.id);
            return tokenRecord ? { ...worker, token: tokenRecord.token } : null;
          })
          .filter(Boolean);

        console.log(`✅ ${eligibleWorkers.length} eligible workers with FCM tokens for booking ${booking.id}`);

        let workersNotified = 0;
        let fcmSuccessCount = 0;

        for (const worker of eligibleWorkers) {
          try {
            console.log(`📤 Sending FCM to ${worker.full_name} (${worker.id}), token: ${worker.token?.substring(0, 20)}...`);
            
            // Call the SAME send-worker-fcm edge function used by instant bookings
            const fcmResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-worker-fcm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                token: worker.token,
                title: 'New Booking',
                body: `${booking.service_type} • ${booking.community}`,
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

        workerResults.push({ booking_id: booking.id, workers_notified: workersNotified, fcm_success: fcmSuccessCount });
      } else if (!booking.prealert_sent && diffMin <= -5) {
        // Booking is more than 5 mins past due - mark as processed to avoid spam
        console.log(`⏰ Booking ${booking.id} is ${Math.abs(diffMin).toFixed(1)} mins past due, marking prealert_sent`);
        await supabase.from('bookings')
          .update({ prealert_sent: true })
          .eq('id', booking.id);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms, worker_alerts=${workerResults.length}, user_reminders=${userReminderResults.length}`);

    return new Response(JSON.stringify({ 
      ok: true, 
      worker_results: workerResults, 
      user_reminder_results: userReminderResults,
      duration_ms: duration 
    }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
