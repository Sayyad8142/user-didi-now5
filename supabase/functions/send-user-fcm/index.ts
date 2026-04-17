// ============================================================================
// User FCM Notifications - Send push to users by user_id
// Uses fcm_tokens table (unified token storage)
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query unified fcm_tokens table — try with platform column, fallback if missing.
    let tokens: Array<{ token: string; user_id: string; platform?: string | null }> | null = null;
    let tokenError: any = null;

    {
      const res = await supabase
        .from('fcm_tokens')
        .select('token, user_id, platform')
        .in('user_id', userIds);
      tokens = res.data as any;
      tokenError = res.error;

      // Graceful fallback if `platform` column doesn't exist yet on this DB.
      if (tokenError && /column .*platform.* does not exist/i.test(tokenError.message || '')) {
        console.warn('⚠️ fcm_tokens.platform column missing — falling back without it. Run docs/fcm-tokens-platform-migration.sql.');
        const fb = await supabase
          .from('fcm_tokens')
          .select('token, user_id')
          .in('user_id', userIds);
        tokens = fb.data as any;
        tokenError = fb.error;
      }
    }

    if (tokenError) {
      console.error('❌ Error fetching tokens from fcm_tokens:', tokenError);
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

    const platformBreakdown = tokens.reduce<Record<string, number>>((acc, t) => {
      const p = (t.platform || 'unknown').toLowerCase();
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    console.log(`📱 Found ${tokens.length} token(s) for ${userIds.length} user(s) | platforms=${JSON.stringify(platformBreakdown)}`);

    // Convert data values to strings (FCM v1 requires string values)
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    // Auto-generate deep_link for booking-related notifications
    if (!stringData.deep_link && stringData.booking_id) {
      stringData.deep_link = `/booking/${stringData.booking_id}`;
    }

    // Send to all tokens
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { token, user_id, platform } of tokens) {
      try {
        await sendFcmV1Message(
          token,
          title,
          messageBody,
          Object.keys(stringData).length > 0 ? stringData : undefined,
          { platform: platform || undefined, userId: user_id }
        );
        sent++;
        console.log(`✅ Sent | user=${user_id} | platform=${platform || 'unknown'} | token=${token.substring(0, 12)}…`);
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed | user=${user_id} | platform=${platform || 'unknown'} | ${errorMsg}`);
        errors.push(`${user_id}[${platform || '?'}]: ${errorMsg}`);

        if (errorMsg.includes('NOT_FOUND') || errorMsg.includes('UNREGISTERED')) {
          console.log(`🗑️ Removing invalid token for user ${user_id} (platform=${platform || 'unknown'})`);
          await supabase
            .from('fcm_tokens')
            .delete()
            .eq('token', token);
        }
      }
    }

    // Log notification attempt
    try {
      await supabase
        .from('notification_logs')
        .insert({
          notification_type: 'user_push',
          booking_id: data?.booking_id || null,
          sent_at: new Date().toISOString(),
        });
    } catch (logError) {
      console.log('Note: Could not log to notification_logs');
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
