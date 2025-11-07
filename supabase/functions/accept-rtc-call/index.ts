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

    const { rtc_call_id } = await req.json();
    if (!rtc_call_id) {
      return new Response(
        JSON.stringify({ error: 'rtc_call_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get rtc_call details and verify user is callee
    const { data: rtcCall, error: rtcError } = await supabaseClient
      .from('rtc_calls')
      .select('*')
      .eq('id', rtc_call_id)
      .single();

    if (rtcError || !rtcCall) {
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is callee
    if (rtcCall.callee_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only callee can accept the call' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check call status
    if (rtcCall.status !== 'initiated') {
      return new Response(
        JSON.stringify({ error: `Cannot accept call with status: ${rtcCall.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Daily API credentials
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');

    if (!DAILY_API_KEY) {
      console.error('DAILY_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'Call service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create callee token (5 min expiry)
    const calleeTokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: rtcCall.room_id,
          user_name: 'callee',
          exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        },
      }),
    });

    if (!calleeTokenResponse.ok) {
      const errorText = await calleeTokenResponse.text();
      console.error('Failed to create callee token:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create call token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calleeTokenData = await calleeTokenResponse.json();
    const callee_token = calleeTokenData.token;

    // Update rtc_calls status
    const { error: updateError } = await supabaseClient
      .from('rtc_calls')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', rtc_call_id);

    if (updateError) {
      console.error('Failed to update rtc_calls status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update call status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        room_id: rtcCall.room_id,
        callee_token,
        room_url: `https://${Deno.env.get('DAILY_DOMAIN')}/${rtcCall.room_id}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in accept-rtc-call:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
