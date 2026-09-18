// ============================================================================
// User FCM Notifications - Send push to users by user_id
// Uses user_fcm_tokens, keyed to profiles.id for Firebase-authenticated users
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFcmV1Message, FcmSendError } from "../_shared/fcmV1.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform',
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
    const eventType = String(data?.type || 'user_push').toLowerCase();
    const bookingId = data?.booking_id ? String(data.booking_id) : null;
    
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

    // user_fcm_tokens lives on the EXTERNAL production project — the same DB that
    // register-user-fcm-token writes to. Using the Lovable-injected
    // SUPABASE_URL here made the sender read an empty table.
    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    console.log('[send-user-fcm] DB host:', new URL(EXTERNAL_SUPABASE_URL).host);

    // Cancellation can converge here from the user endpoint, refund endpoint,
    // or a caller retry. A successful send is recorded once per booking and
    // subsequent attempts are accepted without delivering another alert.
    if (eventType === 'booking_cancelled' && bookingId) {
      const { data: prior, error: priorError } = await supabase
        .from('notification_logs')
        .select('booking_id')
        .eq('notification_type', 'booking_cancelled')
        .eq('booking_id', bookingId)
        .limit(1);
      if (!priorError && prior && prior.length > 0) {
        console.log(`[send-user-fcm] duplicate cancellation suppressed booking=${bookingId}`);
        return new Response(
          JSON.stringify({ ok: true, sent: 0, failed: 0, duplicate: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (priorError) {
        console.warn('[send-user-fcm] cancellation dedup lookup unavailable:', priorError.message);
      }
    }

    // Query the profile-linked user token table.
    let tokens: Array<{ token: string; user_id: string; platform?: string | null }> | null = null;
    let tokenError: any = null;

    {
      const res = await supabase
        .from('user_fcm_tokens')
        .select('token, user_id, platform')
        .in('user_id', userIds);
      tokens = res.data as any;
      tokenError = res.error;

    }

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

        // Prune ONLY when Firebase explicitly says this registration token is
        // unknown/unregistered. Transient errors (auth, 429, 5xx, APNs hiccups)
        // must never delete a device row.
        const tokenInvalid = err instanceof FcmSendError && err.tokenInvalid;
        if (tokenInvalid) {
          console.log(`🗑️ Pruning unregistered token for user ${user_id} (platform=${platform || 'unknown'})`);
          await supabase
            .from('user_fcm_tokens')
            .delete()
            .eq('token', token);
        } else {
          console.log(`↩️ Keeping token for user ${user_id} — failure is not a token-validity error`);
        }
      }

    }

    // Record successful delivery attempts. This row is also the cancellation
    // idempotency marker; failed/no-token attempts remain retryable.
    if (sent > 0) try {
      await supabase
        .from('notification_logs')
        .insert({
          notification_type: eventType,
          booking_id: bookingId,
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
