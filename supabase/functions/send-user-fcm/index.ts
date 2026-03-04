// ============================================================================
// User FCM Notifications - Send push to users by user_id
// Uses user_fcm_tokens table (not fcm_tokens)
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
    const body = await req.json();
    
    // Support both user_id (single) and user_ids (array)
    let userIds: string[] = [];
    if (body.user_ids) {
      userIds = Array.isArray(body.user_ids) ? body.user_ids : [body.user_ids];
    } else if (body.user_id) {
      userIds = [body.user_id];
    }
    
    const { title, body: messageBody, data } = body;
    
    if (userIds.length === 0) {
      console.log('❌ Missing user_id or user_ids');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing user_id or user_ids' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!title || !messageBody) {
      console.log('❌ Missing title or body');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing title or body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📤 Sending push to ${userIds.length} user(s): ${userIds.join(', ')}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${messageBody}`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's FCM tokens from user_fcm_tokens table
    const { data: tokens, error: tokenError } = await supabase
      .from('user_fcm_tokens')
      .select('token, user_id')
      .in('user_id', userIds);

    if (tokenError) {
      console.error('❌ Error fetching tokens from user_fcm_tokens:', tokenError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log(`⚠️ No FCM tokens found for users: ${userIds.join(', ')}`);
      return new Response(
        JSON.stringify({ ok: true, sent: 0, failed: 0, message: 'No tokens found for users' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📱 Found ${tokens.length} token(s) for ${userIds.length} user(s)`);

    // Convert data values to strings (FCM v1 requires string values)
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    // Auto-generate deep_link for booking-related notifications
    if (!stringData.deep_link && stringData.booking_id) {
      stringData.deep_link = `/bookings/${stringData.booking_id}`;
    }

    // Send to all tokens
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { token, user_id } of tokens) {
      try {
        await sendFcmV1Message(
          token,
          title,
          messageBody,
          Object.keys(stringData).length > 0 ? stringData : undefined
        );
        sent++;
        console.log(`✅ Sent to user ${user_id}, token: ${token.substring(0, 20)}...`);
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed to send to user ${user_id}: ${errorMsg}`);
        errors.push(`${user_id}: ${errorMsg}`);
        
        // If token is invalid, remove it from database
        if (errorMsg.includes('NOT_FOUND') || errorMsg.includes('UNREGISTERED')) {
          console.log(`🗑️ Removing invalid token for user ${user_id}`);
          await supabase
            .from('user_fcm_tokens')
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

    console.log(`📊 Result: ${sent} sent, ${failed} failed out of ${tokens.length} total`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        sent, 
        failed,
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
