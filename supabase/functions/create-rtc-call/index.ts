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

    // Create Daily room
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
          exp: Math.floor(Date.now() / 1000) + 600, // Expires in 10 minutes
        },
      }),
    });

    if (!roomResponse.ok) {
      const errorText = await roomResponse.text();
      console.error('Failed to create Daily room:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create call room' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roomData = await roomResponse.json();
    const room_id = roomData.name;
    console.log(`✅ Room created: ${room_id}`);

    // Create caller token (5 min expiry)
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
          exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        },
      }),
    });

    if (!callerTokenResponse.ok) {
      console.error('Failed to create caller token');
      return new Response(
        JSON.stringify({ error: 'Failed to create call token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerTokenData = await callerTokenResponse.json();
    const caller_token = callerTokenData.token;

    // Insert rtc_calls row
    const { data: rtcCall, error: rtcError } = await supabaseClient
      .from('rtc_calls')
      .insert({
        booking_id,
        caller_id,
        callee_id,
        room_id,
        status: 'initiated',
      })
      .select()
      .single();

    if (rtcError) {
      console.error('Failed to insert rtc_calls row:', rtcError);
      return new Response(
        JSON.stringify({ error: 'Failed to create call record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Call created successfully: ${rtcCall.id}`);

    // TODO: Send push notification to callee
    // For now, we'll use Supabase realtime for notification

    // Try to get worker FCM token if callee is worker
    if (booking.worker_id === callee_id) {
      const { data: worker } = await supabaseClient
        .from('workers')
        .select('fcm_token')
        .eq('id', callee_id)
        .single();

      if (worker?.fcm_token) {
        // TODO: Send FCM notification with type 'incoming_rtc' and rtc_call_id
        console.log(`📲 Would send FCM to worker with token: ${worker.fcm_token}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rtc_call_id: rtcCall.id,
        room_id,
        caller_token,
        room_url: roomData.url,
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
