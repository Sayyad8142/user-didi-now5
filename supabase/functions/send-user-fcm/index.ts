// ============================================================================
// User FCM Notifications - Send push to users by user_id
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const { user_id, title, body, data } = await req.json();
    
    if (!user_id) {
      console.log('❌ Missing user_id');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!title || !body) {
      console.log('❌ Missing title or body');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing title or body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📤 Sending push to user: ${user_id}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's FCM tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) {
      console.error('❌ Error fetching tokens:', tokenError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log(`⚠️ No FCM tokens found for user: ${user_id}`);
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: 'No tokens found for user' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📱 Found ${tokens.length} token(s) for user`);

    // Convert data values to strings (FCM v1 requires string values)
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    // Send to all tokens
    let sent = 0;
    const errors: string[] = [];

    for (const { token } of tokens) {
      try {
        await sendFcmV1Message(
          token,
          title,
          body,
          Object.keys(stringData).length > 0 ? stringData : undefined
        );
        sent++;
        console.log(`✅ Sent to token: ${token.substring(0, 20)}...`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed to send to token: ${errorMsg}`);
        errors.push(errorMsg);
        
        // If token is invalid, remove it from database
        if (errorMsg.includes('NOT_FOUND') || errorMsg.includes('UNREGISTERED')) {
          console.log(`🗑️ Removing invalid token from database`);
          await supabase
            .from('fcm_tokens')
            .delete()
            .eq('token', token);
        }
      }
    }

    // Log notification attempt if notification_logs table exists
    try {
      await supabase
        .from('notification_logs')
        .insert({
          notification_type: 'user_push',
          booking_id: data?.booking_id || null,
          sent_at: new Date().toISOString(),
        });
    } catch (logError) {
      // notification_logs table may not exist, ignore error
      console.log('Note: Could not log to notification_logs (table may not exist)');
    }

    console.log(`📊 Result: ${sent}/${tokens.length} sent successfully`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        sent, 
        total: tokens.length,
        errors: errors.length > 0 ? errors : undefined 
      }),
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
