// ============================================================================
// Cleanup Unpaid Bookings
// Cancels Pay Now bookings that were never paid within 15 minutes.
// Runs via cron every 5 minutes.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    console.log('🧹 cleanup-unpaid-bookings: Cancelling unpaid Pay Now bookings older than', cutoff);

    // Cancel bookings where:
    // - payment_status = 'pending' (Pay Now was selected but never paid)
    // - payment_method IS NULL (not 'pay_after_service')
    // - status = 'pending' (not already cancelled/completed)
    // - created_at < 15 minutes ago
    const { data, error, count } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: 'payment_not_completed_timeout',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'system',
        cancel_source: 'system',
        cancel_reason: 'Payment not completed within 15 minutes',
      })
      .eq('payment_status', 'pending')
      .is('payment_method', null)
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select('id');

    if (error) {
      console.error('❌ cleanup-unpaid-bookings error:', error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cancelledIds = (data || []).map((b: any) => b.id);
    console.log(`✅ cleanup-unpaid-bookings: Cancelled ${cancelledIds.length} orphan bookings`, cancelledIds);

    return new Response(JSON.stringify({
      ok: true,
      cancelled_count: cancelledIds.length,
      cancelled_ids: cancelledIds,
      cutoff,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ cleanup-unpaid-bookings exception:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
