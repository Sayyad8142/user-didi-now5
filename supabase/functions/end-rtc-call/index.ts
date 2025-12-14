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

    const { rtc_call_id, reason = 'completed' } = await req.json();
    if (!rtc_call_id) {
      return new Response(
        JSON.stringify({ error: 'rtc_call_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📴 Ending RTC call: ${rtc_call_id} Reason: ${reason}`);

    // Get rtc_call details
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

    // Verify user is caller or callee
    if (rtcCall.caller_id !== user.id && rtcCall.callee_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only call participants can end the call' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate duration if call was active
    let duration_sec = null;
    if (rtcCall.started_at) {
      const startTime = new Date(rtcCall.started_at).getTime();
      const endTime = Date.now();
      duration_sec = Math.floor((endTime - startTime) / 1000);
    }

    console.log(`🔄 Updating call to status: ${reason} Duration: ${duration_sec}`);

    // Determine the final status based on reason
    // Valid statuses: initiated, ringing, active, completed, failed, rejected
    const finalStatus = ['completed', 'failed', 'rejected'].includes(reason) ? reason : 'completed';

    // Update rtc_calls status
    const { error: updateError } = await supabaseClient
      .from('rtc_calls')
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
        duration_sec,
      })
      .eq('id', rtc_call_id);

    if (updateError) {
      console.error('❌ Failed to update rtc_calls status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update call status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Call ended: ${rtc_call_id} Duration: ${duration_sec} sec`);

    // Optionally delete the Daily room to free up resources
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');
    if (DAILY_API_KEY && rtcCall.room_id) {
      try {
        await fetch(`https://api.daily.co/v1/rooms/${rtcCall.room_id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${DAILY_API_KEY}`,
          },
        });
        console.log(`Deleted Daily room: ${rtcCall.room_id}`);
      } catch (deleteError) {
        console.error('Failed to delete Daily room:', deleteError);
        // Non-critical error, continue
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        duration_sec,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in end-rtc-call:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
