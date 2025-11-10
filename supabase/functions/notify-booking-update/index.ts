import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { booking_id, status, worker_name } = await req.json();

    if (!booking_id || !status) {
      return new Response(
        JSON.stringify({ error: 'booking_id and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📲 Notifying user about booking ${booking_id} status: ${status}`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('user_id, service_type')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's FCM token
    const { data: fcmToken, error: tokenError } = await supabaseClient
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', booking.user_id)
      .single();

    if (tokenError || !fcmToken?.token) {
      console.log('No FCM token found for user:', booking.user_id);
      return new Response(
        JSON.stringify({ success: true, message: 'No FCM token found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare notification based on status
    let title = '';
    let body = '';
    
    switch (status) {
      case 'assigned':
      case 'confirmed':
        title = '🎉 Booking Confirmed!';
        body = worker_name 
          ? `${worker_name} will arrive in ~10 minutes`
          : 'Your worker will arrive in ~10 minutes';
        break;
      case 'cancelled':
        title = 'Booking Cancelled';
        body = "We're sorry, no worker is available right now.";
        break;
      case 'completed':
        title = '✅ Service Completed!';
        body = 'Thanks for using our service! Please rate your experience.';
        break;
      case 'in_progress':
        title = '🏃 Worker Started!';
        body = 'Your service is now in progress.';
        break;
      default:
        title = 'Booking Update';
        body = `Your booking status changed to ${status}`;
    }

    // Send FCM notification using our edge function
    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
    if (!FCM_SERVER_KEY) {
      console.error('FCM_SERVER_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FCM not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: fcmToken.token,
        notification: {
          title,
          body,
          icon: '/icon.png',
          badge: '/icon.png',
          sound: 'default',
        },
        data: {
          booking_id,
          status,
          type: 'BOOKING_UPDATE',
        },
        priority: 'high',
      }),
    });

    const fcmResult = await fcmResponse.json();

    if (!fcmResponse.ok || fcmResult.failure > 0) {
      console.error('FCM send failed:', fcmResult);
    } else {
      console.log('✅ FCM notification sent successfully');
    }

    return new Response(
      JSON.stringify({ success: true, result: fcmResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
