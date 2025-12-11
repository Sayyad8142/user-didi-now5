// ============================================================================
// Worker FCM Notifications - Using FCM HTTP v1 API
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendFcmV1Message } from "../_shared/fcmV1.ts";

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
    
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing FCM token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert data values to strings (FCM v1 requires string values in data)
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    // Remove flat number from notification body (e.g., "• Flat 9198" or "• Flat 123")
    // The flat_no is still in data payload for worker app to display in-app
    let cleanBody = body || 'You have a new booking request';
    cleanBody = cleanBody.replace(/\s*•\s*Flat\s*\S*/gi, '').trim();

    await sendFcmV1Message(
      token,
      title || 'New Booking',
      cleanBody,
      Object.keys(stringData).length > 0 ? stringData : undefined
    );

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
