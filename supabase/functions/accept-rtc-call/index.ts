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

    // Get the Supabase profile UUID from Firebase UID
    // user.id is the Firebase UID (string), we need the profile.id (UUID)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('firebase_uid', user.id)
      .maybeSingle();

    const profileId = profile?.id;
    console.log(`[accept-rtc-call] Firebase UID: ${user.id}, Profile UUID: ${profileId}`);

    const { rtc_call_id } = await req.json();
    if (!rtc_call_id) {
      console.error('❌ No rtc_call_id provided');
      return new Response(
        JSON.stringify({ error: 'rtc_call_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📞 Accepting call: ${rtc_call_id}`);

    // Get rtc_call details and verify user is callee
    const { data: rtcCall, error: rtcError } = await supabaseClient
      .from('rtc_calls')
      .select('*')
      .eq('id', rtc_call_id)
      .single();

    if (rtcError || !rtcCall) {
      console.error('❌ Call not found:', rtcError);
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Current call status: ${rtcCall.status}`);

    // Verify user is callee - compare using Supabase UUID
    if (!profileId || rtcCall.callee_id !== profileId) {
      console.error('❌ User is not the callee');
      return new Response(
        JSON.stringify({ error: 'Only callee can accept the call' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check call status - must be 'ringing'
    if (rtcCall.status !== 'ringing') {
      console.error(`❌ Invalid status for accept: ${rtcCall.status}`);
      return new Response(
        JSON.stringify({ error: `Cannot accept call with status: ${rtcCall.status}. Expected 'ringing'` }),
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

    // Create callee token with 10 minutes expiry
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
          exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        },
      }),
    });

    if (!calleeTokenResponse.ok) {
      const errorText = await calleeTokenResponse.text();
      console.error(`❌ Failed to create callee token (${calleeTokenResponse.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create call token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calleeTokenData = await calleeTokenResponse.json();
    const callee_token = calleeTokenData.token;
    console.log(`✅ Callee token generated`);

    // Update rtc_calls status from 'ringing' to 'active'
    console.log(`🔄 Updating call status to 'active'`);
    const { error: updateError } = await supabaseClient
      .from('rtc_calls')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', rtc_call_id);

    if (updateError) {
      console.error('❌ Failed to update rtc_calls status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update call status', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Call accepted successfully: ${rtc_call_id}`);

    // Construct full Daily.co room URL
    const room_url = `https://${Deno.env.get('DAILY_DOMAIN')}/${rtcCall.room_id}`;

    return new Response(
      JSON.stringify({
        success: true,
        room_id: rtcCall.room_id,
        room_url, // Return full Daily.co URL
        callee_token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in accept-rtc-call:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
