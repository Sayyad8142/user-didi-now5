import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, title, body, data } = await req.json();

    if (!token || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'token, title, and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
    if (!FCM_SERVER_KEY) {
      console.error('FCM_SERVER_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FCM not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📲 Sending FCM notification to token: ${token.substring(0, 20)}...`);

    // Send FCM notification
    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title,
          body,
          icon: '/icon.png',
          badge: '/icon.png',
          sound: 'default',
        },
        data: data || {},
        priority: 'high',
      }),
    });

    const fcmResult = await fcmResponse.json();

    if (!fcmResponse.ok || fcmResult.failure > 0) {
      console.error('FCM send failed:', fcmResult);
      return new Response(
        JSON.stringify({ error: 'Failed to send notification', details: fcmResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ FCM notification sent successfully');

    return new Response(
      JSON.stringify({ success: true, result: fcmResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error sending FCM notification:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
