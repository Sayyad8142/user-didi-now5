import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json();
  const { action, booking_id, reason } = body;
  const results: Record<string, unknown> = {};

  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    if (action === "migrate") {
      // Use raw postgres for DDL
      const sql = postgres(dbUrl);

      try {
        // 1. Create unique index
        await sql.unsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_one_refund_credit_per_booking
            ON public.wallet_transactions (booking_id)
            WHERE type = 'credit' AND reference_type = 'booking_refund';
        `);
        results.index = "created";

        // 2. Create/replace credit_wallet_on_cancel function
        await sql.unsafe(`
          CREATE OR REPLACE FUNCTION public.credit_wallet_on_cancel(
            p_booking_id uuid,
            p_reason text DEFAULT 'booking_cancelled'
          )
          RETURNS jsonb
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $fn$
          DECLARE
            v_booking record;
            v_refund_amount numeric;
          BEGIN
            SELECT id, user_id, price_inr, payment_status, payment_amount_inr,
                   wallet_used_amount, razorpay_paid_amount,
                   wallet_refund_status, otp_verified_at, payment_method, status
              INTO v_booking
              FROM public.bookings
             WHERE id = p_booking_id
             FOR UPDATE;

            IF v_booking IS NULL THEN
              RETURN jsonb_build_object('error', 'booking_not_found');
            END IF;

            IF v_booking.payment_status NOT IN ('paid', 'moved_to_wallet') THEN
              RETURN jsonb_build_object('skipped', true, 'reason', 'booking_not_paid', 'payment_status', v_booking.payment_status);
            END IF;

            IF v_booking.otp_verified_at IS NOT NULL THEN
              RETURN jsonb_build_object('error', 'otp_already_verified');
            END IF;

            IF v_booking.wallet_refund_status = 'credited' THEN
              RETURN jsonb_build_object('skipped', true, 'reason', 'already_refunded', 'refund_amount', COALESCE(v_booking.wallet_refund_amount, 0));
            END IF;

            v_refund_amount := COALESCE(v_booking.price_inr, v_booking.payment_amount_inr, 0);

            IF v_refund_amount <= 0 THEN
              RETURN jsonb_build_object('skipped', true, 'reason', 'zero_amount');
            END IF;

            INSERT INTO public.user_wallets (user_id, balance_inr)
            VALUES (v_booking.user_id, 0)
            ON CONFLICT (user_id) DO NOTHING;

            PERFORM 1 FROM public.user_wallets WHERE user_id = v_booking.user_id FOR UPDATE;

            UPDATE public.user_wallets
               SET balance_inr = balance_inr + v_refund_amount, updated_at = now()
             WHERE user_id = v_booking.user_id;

            BEGIN
              INSERT INTO public.wallet_transactions
                (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
              VALUES (
                v_booking.user_id, p_booking_id, 'credit', v_refund_amount, p_reason,
                'booking_refund', p_booking_id::text,
                'Refund: ' || p_reason || ' | method=' || COALESCE(v_booking.payment_method, 'unknown')
                  || ' | wallet_used=' || COALESCE(v_booking.wallet_used_amount, 0)::text
                  || ' | razorpay_paid=' || COALESCE(v_booking.razorpay_paid_amount, 0)::text
              );
            EXCEPTION WHEN unique_violation THEN
              RETURN jsonb_build_object('skipped', true, 'reason', 'duplicate_transaction_blocked', 'refund_amount', v_refund_amount);
            END;

            UPDATE public.bookings
               SET wallet_refund_status = 'credited',
                   wallet_refund_amount = v_refund_amount,
                   wallet_refund_at = now(),
                   wallet_refund_reason = p_reason,
                   payment_status = 'refunded_to_wallet'
             WHERE id = p_booking_id;

            RETURN jsonb_build_object('success', true, 'refund_amount', v_refund_amount, 'reason', p_reason, 'user_id', v_booking.user_id, 'booking_id', p_booking_id);
          END;
          $fn$;
        `);
        results.credit_wallet_on_cancel = "created";

        // 3. Create/replace trigger function
        await sql.unsafe(`
          CREATE OR REPLACE FUNCTION public.auto_wallet_refund_on_cancel()
          RETURNS trigger
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $fn$
          DECLARE
            v_reason text;
            v_result jsonb;
          BEGIN
            IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
              IF NEW.payment_status IN ('paid') AND NEW.otp_verified_at IS NULL THEN
                v_reason := COALESCE(
                  NEW.cancellation_reason,
                  CASE NEW.cancelled_by
                    WHEN 'admin' THEN 'admin_cancelled'
                    WHEN 'system' THEN 'no_worker_found'
                    WHEN 'user' THEN 'user_cancelled_before_completion'
                    ELSE 'booking_cancelled'
                  END
                );
                v_result := public.credit_wallet_on_cancel(NEW.id, v_reason);
                RAISE NOTICE 'auto_wallet_refund: booking=% result=%', NEW.id, v_result;
              END IF;
            END IF;
            RETURN NEW;
          END;
          $fn$;
        `);
        results.auto_wallet_refund_on_cancel = "created";

        // 4. Create trigger
        await sql.unsafe(`DROP TRIGGER IF EXISTS trg_auto_wallet_refund_on_cancel ON public.bookings;`);
        await sql.unsafe(`
          CREATE TRIGGER trg_auto_wallet_refund_on_cancel
            AFTER UPDATE ON public.bookings
            FOR EACH ROW
            EXECUTE FUNCTION public.auto_wallet_refund_on_cancel();
        `);
        results.trigger = "created";

        // 5. Admin helper
        await sql.unsafe(`
          CREATE OR REPLACE FUNCTION public.admin_refund_booking_to_wallet(
            p_booking_id uuid,
            p_reason text DEFAULT 'admin_cancelled'
          )
          RETURNS jsonb
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $fn$
          BEGIN
            RETURN public.credit_wallet_on_cancel(p_booking_id, p_reason);
          END;
          $fn$;
        `);
        results.admin_refund_function = "created";
      } finally {
        await sql.end();
      }

    } else if (action === "verify") {
      const sql = postgres(dbUrl);
      try {
        const funcs = await sql`SELECT proname FROM pg_proc WHERE proname IN ('credit_wallet_on_cancel','auto_wallet_refund_on_cancel','admin_refund_booking_to_wallet') AND pronamespace = 'public'::regnamespace`;
        results.functions = funcs.map((r: any) => r.proname);

        const triggers = await sql`SELECT tgname, tgrelid::regclass::text as table_name FROM pg_trigger WHERE tgname = 'trg_auto_wallet_refund_on_cancel'`;
        results.triggers = triggers.map((r: any) => ({ name: r.tgname, table: r.table_name }));

        const indexes = await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'wallet_transactions' AND indexname LIKE 'uq_%'`;
        results.indexes = indexes.map((r: any) => r.indexname);
      } finally {
        await sql.end();
      }

    } else if (action === "find_test_bookings") {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      const { data: paid } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, payment_method, wallet_used_amount, razorpay_paid_amount, wallet_refund_status, otp_verified_at, status")
        .eq("payment_status", "paid")
        .is("otp_verified_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      results.paid_bookings = paid;

      const { data: unpaid } = await supabase
        .from("bookings")
        .select("id, user_id, price_inr, payment_status, status")
        .in("payment_status", ["unpaid", "pending", "pay_after_service"])
        .order("created_at", { ascending: false })
        .limit(3);
      results.unpaid_bookings = unpaid;

    } else if (action === "wallet_before") {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data } = await supabase
        .from("user_wallets")
        .select("*")
        .eq("user_id", body.user_id)
        .maybeSingle();
      results.wallet = data;

    } else if (action === "run_refund") {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await supabase.rpc("credit_wallet_on_cancel", {
        p_booking_id: booking_id,
        p_reason: reason || "admin_cancelled",
      });
      results.refund_result = data || error?.message;

    } else if (action === "check_after") {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, payment_status, wallet_refund_status, wallet_refund_amount, wallet_refund_at, wallet_refund_reason")
        .eq("id", booking_id)
        .single();
      results.booking = booking;

      const { data: txns } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("booking_id", booking_id)
        .eq("type", "credit");
      results.wallet_transactions = txns;

      if (booking) {
        const { data: wallet } = await supabase
          .from("user_wallets")
          .select("*")
          .eq("user_id", (booking as any).user_id || body.user_id)
          .maybeSingle();
        results.wallet_after = wallet;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
