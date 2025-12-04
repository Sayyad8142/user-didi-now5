// ============================================================================
// Test FCM v1 - Verify FCM HTTP v1 configuration is working
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
    const { token } = await req.json();
    
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing token in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧪 Testing FCM v1 with token:', token.substring(0, 20) + '...');

    await sendFcmV1Message(
      token,
      'Didi Now FCM v1 Test',
      'If you see this, v1 works!',
      { test: 'true', timestamp: new Date().toISOString() }
    );

    console.log('✅ FCM v1 test successful');

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ FCM v1 test failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
