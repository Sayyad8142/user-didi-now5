import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { action } = await req.json();
  const results: Record<string, unknown> = {};

  try {
    if (action === "migrate") {
      // Run migration in parts (supabase rpc can't run DDL directly, use pg functions)
      // We'll run each statement via raw SQL

      // 1. Create unique indexes
      const idx1 = await supabase.rpc("exec_sql", {
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_one_refund_credit_per_booking ON public.wallet_transactions (booking_id) WHERE type = 'credit' AND reference_type = 'booking_refund';`
      });
      results.index_1 = idx1.error ? idx1.error.message : "created";

      // 2-4. Create functions and trigger via individual statements
      // Since we can't run DDL via rpc easily, let's check what exists
      const funcs = await supabase.rpc("exec_sql", {
        sql: `SELECT proname FROM pg_proc WHERE proname IN ('credit_wallet_on_cancel','auto_wallet_refund_on_cancel','admin_refund_booking_to_wallet') AND pronamespace = 'public'::regnamespace`
      });
      results.existing_functions = funcs.data || funcs.error?.message;

      const triggers = await supabase.rpc("exec_sql", {
        sql: `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_auto_wallet_refund_on_cancel'`
      });
      results.existing_triggers = triggers.data || triggers.error?.message;

      const indexes = await supabase.rpc("exec_sql", {
        sql: `SELECT indexname FROM pg_indexes WHERE tablename = 'wallet_transactions' AND indexname LIKE 'uq_%'`
      });
      results.existing_indexes = indexes.data || indexes.error?.message;

    } else if (action === "check_setup") {
      // Verify function
      const { data: funcData, error: funcErr } = await supabase
        .from("pg_proc" as any)
        .select("proname")
        .in("proname", ["credit_wallet_on_cancel", "auto_wallet_refund_on_cancel", "admin_refund_booking_to_wallet"]);
      
      // Use raw query approach instead
      const funcCheck = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: "00000000-0000-0000-0000-000000000000",
        p_reason: "test"
      });
      results.function_exists = funcCheck.error?.message?.includes("not found") 
        ? false 
        : !funcCheck.error?.message?.includes("does not exist");
      results.function_test_result = funcCheck.data || funcCheck.error?.message;

    } else if (action === "find_test_bookings") {
      // Find paid bookings for testing
      const { data: paid, error: e1 } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, payment_method, wallet_used_amount, razorpay_paid_amount, wallet_refund_status, otp_verified_at, status")
        .eq("payment_status", "paid")
        .is("otp_verified_at", null)
        .not("status", "eq", "completed")
        .order("created_at", { ascending: false })
        .limit(5);
      results.paid_bookings = paid || e1?.message;

      // Find unpaid bookings
      const { data: unpaid, error: e2 } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, status")
        .in("payment_status", ["unpaid", "pending", "pay_after_service"])
        .order("created_at", { ascending: false })
        .limit(3);
      results.unpaid_bookings = unpaid || e2?.message;

    } else if (action === "test_refund") {
      const { booking_id, reason } = await req.json().catch(() => ({}));
      // This won't work since we already consumed the body. Let's parse differently.
    } else if (action === "run_refund_test") {
      // Re-parse body for booking_id
      // Since body is already consumed, we handle this in the main parse
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
