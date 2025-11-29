import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkerNotificationPayload {
  worker_id: string;
  fcm_token: string;
  booking_id: string;
  service_type: string;
  community: string;
  flat_no: string;
  cust_name?: string;
}

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

    const payload: WorkerNotificationPayload = await req.json();
    const { fcm_token, booking_id, service_type, community, flat_no, cust_name } = payload;

    if (!fcm_token || !booking_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construct notification
    const notificationTitle = '🔔 New Booking Request';
    const notificationBody = `${service_type} • ${community} • Flat ${flat_no}${cust_name ? ' • ' + cust_name : ''}`;

    // Send to FCM
    const fcmUrl = 'https://fcm.googleapis.com/fcm/send';
    const fcmResponse = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: fcm_token,
        notification: {
          title: notificationTitle,
          body: notificationBody,
          sound: 'default',
          priority: 'high',
        },
        data: {
          booking_id: booking_id,
          service_type: service_type,
          community: community,
          type: 'new_booking',
        },
        priority: 'high',
      }),
    });

    const fcmResult = await fcmResponse.json();

    if (!fcmResponse.ok || fcmResult.failure === 1) {
      console.error('❌ FCM send failed:', fcmResult);
      return new Response(
        JSON.stringify({ ok: false, error: 'FCM send failed', details: fcmResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ FCM notification sent successfully:', { booking_id, worker_id: payload.worker_id });

    return new Response(
      JSON.stringify({ ok: true, message_id: fcmResult.results?.[0]?.message_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in send-worker-fcm:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
