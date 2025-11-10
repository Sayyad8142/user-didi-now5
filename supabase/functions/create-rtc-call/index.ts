import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'booking_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📞 Creating RTC call for booking: ${booking_id}`);

    // Get booking details - worker_id is directly on the booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('user_id, worker_id')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('❌ Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!booking.worker_id) {
      console.error('❌ Worker not assigned yet');
      return new Response(
        JSON.stringify({ error: 'Worker not assigned to this booking yet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine caller and callee
    const caller_id = user.id;
    let callee_id: string;

    if (booking.user_id === caller_id) {
      // User is calling worker
      callee_id = booking.worker_id;
    } else if (booking.worker_id === caller_id) {
      // Worker is calling user
      callee_id = booking.user_id;
    } else {
      console.error('❌ Caller not part of booking. User:', booking.user_id, 'Worker:', booking.worker_id, 'Caller:', caller_id);
      return new Response(
        JSON.stringify({ error: 'Caller is not part of this booking' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📞 Call from ${caller_id} to ${callee_id}`);

    // Get Daily API credentials
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');
    const DAILY_DOMAIN = Deno.env.get('DAILY_DOMAIN');

    if (!DAILY_API_KEY || !DAILY_DOMAIN) {
      console.error('DAILY_API_KEY or DAILY_DOMAIN not set');
      return new Response(
        JSON.stringify({ error: 'Call service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Daily room with 10 minutes expiry
    const roomName = `call-${booking_id}-${Date.now()}`;
    console.log(`📞 Creating Daily room: ${roomName}`);
    
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: {
          start_audio_off: false,
          start_video_off: true,
          exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        },
      }),
    });

    if (!roomResponse.ok) {
      const errorText = await roomResponse.text();
      console.error(`❌ Failed to create Daily room (${roomResponse.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create call room' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roomData = await roomResponse.json();
    const room_id = roomData.name;
    const room_url = roomData.url; // Full Daily.co URL
    console.log(`✅ Room created: ${room_id}, URL: ${room_url}`);

    // Create caller token with 10 minutes expiry
    const callerTokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: room_id,
          user_name: 'caller',
          exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        },
      }),
    });

    if (!callerTokenResponse.ok) {
      const errorText = await callerTokenResponse.text();
      console.error(`❌ Failed to create caller token (${callerTokenResponse.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create call token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerTokenData = await callerTokenResponse.json();
    const caller_token = callerTokenData.token;
    console.log(`✅ Caller token generated`);

    // Insert rtc_calls row with status 'ringing'
    const { data: rtcCall, error: rtcError } = await supabaseClient
      .from('rtc_calls')
      .insert({
        booking_id,
        caller_id,
        callee_id,
        room_id,
        status: 'ringing', // Changed from 'initiated' to 'ringing'
      })
      .select()
      .single();

    if (rtcError) {
      console.error(`❌ Failed to insert rtc_calls row:`, rtcError);
      return new Response(
        JSON.stringify({ error: 'Failed to create call record', details: rtcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Call created successfully: ${rtcCall.id}`);

    // Send FCM push notification to callee
    if (booking.user_id === callee_id) {
      // Callee is the user - get their FCM token
      const { data: userFcm } = await supabaseClient
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', callee_id)
        .single();

      if (userFcm?.token) {
        console.log(`📲 Sending FCM notification to user: ${callee_id}`);
        
        // Send actual FCM notification
        const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
        if (FCM_SERVER_KEY) {
          try {
            const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${FCM_SERVER_KEY}`,
              },
              body: JSON.stringify({
                to: userFcm.token,
                notification: {
                  title: '📞 Incoming Call',
                  body: `${booking.worker_name || 'Worker'} is calling you`,
                  icon: '/icon.png',
                  sound: 'default',
                },
                data: {
                  type: 'INCOMING_RTC_CALL',
                  rtc_call_id: rtcCall.id,
                  booking_id,
                },
                priority: 'high',
              }),
            });
            const fcmResult = await fcmResponse.json();
            if (fcmResult.success) {
              console.log('✅ FCM sent to user');
            } else {
              console.error('❌ FCM failed:', fcmResult);
            }
          } catch (error) {
            console.error('❌ FCM error:', error);
          }
        }
      } else {
        console.log(`⚠️ No FCM token found for user: ${callee_id}`);
      }
    } else if (booking.worker_id === callee_id) {
      // Callee is the worker
      const { data: worker } = await supabaseClient
        .from('workers')
        .select('fcm_token')
        .eq('id', callee_id)
        .single();

      if (worker?.fcm_token) {
        console.log(`📲 Sending FCM notification to worker: ${callee_id}`);
        // Get caller name from booking
        const { data: callerBooking } = await supabaseClient
          .from('bookings')
          .select('cust_name')
          .eq('id', booking_id)
          .single();
        
        // Send actual FCM notification
        const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
        if (FCM_SERVER_KEY) {
          try {
            const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${FCM_SERVER_KEY}`,
              },
              body: JSON.stringify({
                to: worker.fcm_token,
                notification: {
                  title: '📞 Incoming Call',
                  body: `${callerBooking?.cust_name || 'Customer'} is calling you`,
                  icon: '/icon.png',
                  sound: 'default',
                },
                data: {
                  type: 'INCOMING_RTC_CALL',
                  rtc_call_id: rtcCall.id,
                  booking_id,
                },
                priority: 'high',
              }),
            });
            const fcmResult = await fcmResponse.json();
            if (fcmResult.success) {
              console.log('✅ FCM sent to worker');
            } else {
              console.error('❌ FCM failed:', fcmResult);
            }
          } catch (error) {
            console.error('❌ FCM error:', error);
          }
        }
      } else {
        console.log(`⚠️ No FCM token found for worker: ${callee_id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rtc_call_id: rtcCall.id,
        room_id,
        room_url, // Return full Daily.co URL
        caller_token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error creating call:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
