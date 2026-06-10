/**
 * reconcile-pending-bookings — safety net cron.
 *
 * Sweeps `pending_bookings` rows where status='awaiting_payment'
 * and asks Razorpay for the order's payments. If a captured payment
 * exists but no booking was ever created (frontend never called
 * create-paid-booking, AND webhook was lost/delayed), this function
 * builds the booking using the stashed booking_data.
 *
 * After 30 minutes of waiting and still no payment, the row is
 * marked 'expired'.
 *
 * Runs every 2 minutes via pg_cron (configured on Lovable Cloud).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createBookingFromPending,
  type PendingBookingRow,
} from "../_shared/createBookingFromPending.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_AGE_SECONDS = 90; // give the frontend a fair shot first
const MAX_AGE_HOURS = 24;
const EXPIRE_AFTER_MIN = 30;
const BATCH_LIMIT = 25;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchRazorpayOrderPayments(orderId: string) {
  const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Razorpay ${res.status}: ${txt}`);
  }
  return (await res.json()) as { items: Array<{ id: string; status: string; amount: number; order_id: string }> };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();
  console.log("[reconcile-pending-bookings] reconciliation_started");

  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return json({ error: "Razorpay keys not configured" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cutoffNew = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
    const cutoffOld = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString();
    const expireBefore = new Date(Date.now() - EXPIRE_AFTER_MIN * 60 * 1000).toISOString();

    const { data: rows, error: fetchErr } = await supabase
      .from("pending_bookings")
      .select(
        "razorpay_order_id, user_id, request_id, booking_data, payment_type, wallet_amount, amount_inr, status, booking_id, created_at",
      )
      .eq("status", "awaiting_payment")
      .lte("created_at", cutoffNew)
      .gte("created_at", cutoffOld)
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      console.error("[reconcile-pending-bookings] fetch failed:", fetchErr.message);
      return json({ error: fetchErr.message }, 500);
    }

    const pendingRows = (rows ?? []) as (PendingBookingRow & { created_at: string })[];
    console.log(`[reconcile-pending-bookings] candidates=${pendingRows.length}`);

    const summary = { recovered: 0, expired: 0, still_waiting: 0, failed: 0 };

    for (const pending of pendingRows) {
      try {
        const rpRes = await fetchRazorpayOrderPayments(pending.razorpay_order_id);
        const captured = rpRes.items?.find((p) => p.status === "captured" || p.status === "authorized");

        if (captured) {
          const result = await createBookingFromPending({
            supabase,
            pending,
            razorpay_payment_id: captured.id,
            razorpay_order_id: pending.razorpay_order_id,
            razorpay_amount_paise: captured.amount,
            source: "reconcile",
          });
          if (result.status === "created" || result.status === "already_exists") {
            console.log(
              `[reconcile-pending-bookings] reconciliation_booking_created booking=${result.booking_id} order=${pending.razorpay_order_id} payment=${captured.id} req=${pending.request_id}`,
            );
            summary.recovered++;
          } else {
            summary.failed++;
            console.error(
              `[reconcile-pending-bookings] reconciliation_failed order=${pending.razorpay_order_id} payment=${captured.id} err=${result.error}`,
            );
          }
          continue;
        }

        // No captured payment yet. Expire if too old.
        if (pending.created_at < expireBefore) {
          await supabase
            .from("pending_bookings")
            .update({
              status: "expired",
              last_checked_at: new Date().toISOString(),
              last_error: "No captured payment after expiry window",
            })
            .eq("razorpay_order_id", pending.razorpay_order_id);
          summary.expired++;
          console.log(
            `[reconcile-pending-bookings] expired order=${pending.razorpay_order_id} req=${pending.request_id}`,
          );
        } else {
          await supabase
            .from("pending_bookings")
            .update({ last_checked_at: new Date().toISOString() })
            .eq("razorpay_order_id", pending.razorpay_order_id);
          summary.still_waiting++;
        }
      } catch (loopErr: any) {
        summary.failed++;
        console.error(
          `[reconcile-pending-bookings] reconciliation_failed order=${pending.razorpay_order_id} err=${loopErr.message}`,
        );
        try {
          await supabase
            .from("pending_bookings")
            .update({
              last_checked_at: new Date().toISOString(),
              last_error: loopErr.message?.slice(0, 500),
            })
            .eq("razorpay_order_id", pending.razorpay_order_id);
        } catch (e) {
          console.error("[reconcile-pending-bookings] pending_bookings update failed:", e);
        }

      }
    }

    console.log(
      `[reconcile-pending-bookings] reconciliation_done ms=${Date.now() - startedAt} ${JSON.stringify(summary)}`,
    );
    return json({ ok: true, ...summary, candidates: pendingRows.length });
  } catch (err: any) {
    console.error("[reconcile-pending-bookings] fatal:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
