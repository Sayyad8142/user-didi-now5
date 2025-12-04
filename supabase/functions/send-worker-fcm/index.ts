// ============================================================================
// Worker FCM Notifications - Using Legacy FCM API
// ============================================================================
// Uses legacy FCM HTTP API with server key (more reliable in edge functions)
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
    const { token, title, body, data } = await req.json();
    
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing FCM token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get FCM server key (legacy API)
    const serverKey = Deno.env.get('FCM_SERVER_KEY');
    
    if (!serverKey) {
      console.error('❌ FCM_SERVER_KEY not configured');
      return new Response(
        JSON.stringify({ ok: false, error: 'FCM_SERVER_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📤 Sending FCM to worker:', { title, body, has_token: !!token, token_preview: token.substring(0, 20) });

    // Use legacy FCM HTTP API (no JWT signing required)
    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: title || 'New Booking',
          body: body || 'You have a new booking request',
          sound: 'default',
        },
        data: data || {},
        priority: 'high',
      }),
    });

    const fcmResult = await fcmResponse.json();
    
    console.log('📨 FCM Response:', JSON.stringify(fcmResult));

    if (!fcmResponse.ok || fcmResult.failure > 0) {
      console.error('❌ FCM API error:', fcmResult);
      return new Response(
        JSON.stringify({ ok: false, error: 'FCM failed', details: fcmResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ FCM sent successfully');

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
