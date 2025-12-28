// ============================================================================
// Send User Notification - Push notifications via FCM HTTP v1 API
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFcmV1Message } from "../_shared/fcmV1.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notification_type?: string;
  booking_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { user_id, title, body, data, notification_type, booking_id } = payload;

    // Validate required fields
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

    console.log(`📤 Sending push notification to user: ${user_id}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Type: ${notification_type || 'general'}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch FCM tokens from user_fcm_tokens table
    const { data: tokens, error: tokenError } = await supabase
      .from('user_fcm_tokens')
      .select('id, token, device_info')
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

    // Build FCM data payload - all values must be strings
    const fcmData: Record<string, string> = {
      notification_type: notification_type || 'general',
    };

    // Add booking_id if provided
    if (booking_id) {
      fcmData.booking_id = booking_id;
    }

    // Add any additional data (convert to strings)
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        fcmData[key] = String(value);
      }
    }

    // Send to all tokens
    let sent = 0;
    const errors: string[] = [];
    const invalidTokenIds: string[] = [];

    for (const { id, token, device_info } of tokens) {
      try {
        await sendFcmV1Message(token, title, body, fcmData);
        sent++;
        console.log(`✅ Sent to device: ${device_info || 'unknown'} (${token.substring(0, 20)}...)`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed to send to token: ${errorMsg}`);
        errors.push(errorMsg);

        // Mark invalid/expired tokens for removal
        if (
          errorMsg.includes('NOT_FOUND') ||
          errorMsg.includes('UNREGISTERED') ||
          errorMsg.includes('INVALID_ARGUMENT')
        ) {
          invalidTokenIds.push(id);
        }
      }
    }

    // Remove invalid/expired tokens from database
    if (invalidTokenIds.length > 0) {
      console.log(`🗑️ Removing ${invalidTokenIds.length} invalid token(s) from database`);
      const { error: deleteError } = await supabase
        .from('user_fcm_tokens')
        .delete()
        .in('id', invalidTokenIds);

      if (deleteError) {
        console.error('⚠️ Error removing invalid tokens:', deleteError);
      } else {
        console.log(`✅ Removed ${invalidTokenIds.length} invalid token(s)`);
      }
    }

    // Log notification attempt to notification_queue table
    try {
      await supabase
        .from('notification_queue')
        .insert({
          target_user_id: user_id,
          title,
          body,
          notification_type: notification_type || 'user_push',
          booking_id: booking_id || null,
          data: data || null,
          status: sent > 0 ? 'sent' : 'failed',
          sent_at: sent > 0 ? new Date().toISOString() : null,
        });
    } catch (logError) {
      // Logging is optional, don't fail the request
      console.log('Note: Could not log to notification_queue');
    }

    console.log(`📊 Result: ${sent}/${tokens.length} sent successfully`);

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        total: tokens.length,
        removed_invalid: invalidTokenIds.length,
        errors: errors.length > 0 ? errors : undefined,
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
