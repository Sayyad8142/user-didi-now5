// ============================================================================
// Admin FCM Notifications - Send push to all admins
// Uses admin_fcm_tokens table
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
    const { title, body: messageBody, data, notification_type } = body;

    if (!title || !messageBody) {
      console.log('❌ Missing title or body');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing title or body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📤 Sending admin push notification`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${messageBody}`);
    console.log(`   Type: ${notification_type || 'general'}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all admin FCM tokens from admin_fcm_tokens table
    const { data: tokens, error: tokenError } = await supabase
      .from('admin_fcm_tokens')
      .select('token, user_id');

    if (tokenError) {
      console.error('❌ Error fetching admin tokens:', tokenError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch admin tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log('⚠️ No admin FCM tokens found');
      return new Response(
        JSON.stringify({ ok: true, sent: 0, failed: 0, message: 'No admin tokens found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📱 Found ${tokens.length} admin token(s)`);

    // Convert data values to strings (FCM v1 requires string values)
    const stringData: Record<string, string> = {
      notification_type: notification_type || 'admin_alert',
    };
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    // Send to all admin tokens
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { token, user_id } of tokens) {
      try {
        await sendFcmV1Message(
          token,
          title,
          messageBody,
          stringData
        );
        sent++;
        console.log(`✅ Sent to admin ${user_id}, token: ${token.substring(0, 20)}...`);
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed to send to admin ${user_id}: ${errorMsg}`);
        errors.push(`${user_id}: ${errorMsg}`);
        
        // If token is invalid, remove it from database
        if (errorMsg.includes('NOT_FOUND') || errorMsg.includes('UNREGISTERED')) {
          console.log(`🗑️ Removing invalid token for admin ${user_id}`);
          await supabase
            .from('admin_fcm_tokens')
            .delete()
            .eq('token', token);
        }
      }
    }

    console.log(`📊 Admin notification summary: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        sent, 
        failed,
        errors: errors.length > 0 ? errors : undefined 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in send-admin-fcm:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
