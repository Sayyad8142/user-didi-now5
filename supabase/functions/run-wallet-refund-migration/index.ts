import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json();
  const { action, booking_id, user_id, reason } = body;
  const results: Record<string, unknown> = {};

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (action === "check_tables") {
      // Check if key tables exist by trying to query them
      const checks = ["bookings", "user_wallets", "wallet_transactions"];
      for (const table of checks) {
        const { data, error } = await supabase.from(table).select("*").limit(1);
        results[table] = error ? `ERROR: ${error.message}` : `exists (${data?.length} rows sampled)`;
      }

      // Check existing functions via RPC test
      const { data: fnTest, error: fnErr } = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: "00000000-0000-0000-0000-000000000000",
        p_reason: "test",
      });
      results.credit_wallet_on_cancel_exists = fnErr 
        ? (fnErr.message.includes("does not exist") ? false : `exists (test: ${fnErr.message})`)
        : `exists (result: ${JSON.stringify(fnTest)})`;

    } else if (action === "find_test_bookings") {
      const { data: paid, error: e1 } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, payment_method, wallet_used_amount, razorpay_paid_amount, wallet_refund_status, otp_verified_at, status, booking_type")
        .eq("payment_status", "paid")
        .is("otp_verified_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      results.paid_bookings = paid || e1?.message;

      const { data: unpaid, error: e2 } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, status")
        .in("payment_status", ["unpaid", "pending", "pay_after_service"])
        .order("created_at", { ascending: false })
        .limit(3);
      results.unpaid_bookings = unpaid || e2?.message;

    } else if (action === "wallet_before") {
      const { data } = await supabase.from("user_wallets").select("*").eq("user_id", user_id).maybeSingle();
      results.wallet = data;

    } else if (action === "run_refund") {
      const { data, error } = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: booking_id,
        p_reason: reason || "admin_cancelled",
      });
      results.refund_result = error ? error.message : data;

    } else if (action === "run_refund_duplicate") {
      // Run same refund again to test idempotency
      const { data, error } = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: booking_id,
        p_reason: reason || "admin_cancelled",
      });
      results.duplicate_refund_result = error ? error.message : data;

    } else if (action === "check_after") {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, user_id, payment_status, wallet_refund_status, wallet_refund_amount, wallet_refund_at, wallet_refund_reason, price_inr, payment_method, wallet_used_amount, razorpay_paid_amount")
        .eq("id", booking_id)
        .single();
      results.booking = booking;

      const bookingUserId = (booking as any)?.user_id || user_id;
      
      const { data: txns } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("booking_id", booking_id)
        .eq("type", "credit");
      results.refund_transactions = txns;
      results.refund_transaction_count = txns?.length || 0;

      if (bookingUserId) {
        const { data: wallet } = await supabase
          .from("user_wallets")
          .select("*")
          .eq("user_id", bookingUserId)
          .maybeSingle();
        results.wallet_after = wallet;
      }

    } else if (action === "test_unpaid") {
      const { data, error } = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: booking_id,
        p_reason: "admin_cancelled",
      });
      results.unpaid_refund_result = error ? error.message : data;
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
