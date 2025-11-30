// ============================================================================
// Worker FCM Notifications
// ============================================================================
// Sends Firebase Cloud Messaging notifications to workers for new bookings
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
    
    if (!FCM_SERVER_KEY) {
      console.error('❌ FCM_SERVER_KEY not configured');
      return new Response(
        JSON.stringify({ ok: false, error: 'FCM not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token, title, body, data } = await req.json();
    
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing FCM token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📤 Sending FCM to worker:', { title, body, has_token: !!token });

    // Send FCM notification
    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        priority: 'high',
        notification: {
          title: title || 'New Booking',
          body: body || 'You have a new booking request',
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        data: data || {},
      }),
    });

    const fcmResult = await fcmResponse.json();
    
    if (!fcmResponse.ok) {
      console.error('❌ FCM API error:', fcmResult);
      return new Response(
        JSON.stringify({ ok: false, error: 'FCM failed', details: fcmResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ FCM sent successfully:', fcmResult);

    return new Response(
      JSON.stringify({ ok: true, result: fcmResult }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in send-worker-fcm:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
