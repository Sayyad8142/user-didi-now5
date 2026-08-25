/**
 * sla-checker — SLA MONITORING ONLY. NEVER CANCELS A BOOKING.
 *
 * POLICY (confirmed 2026-08-25):
 *   A booking must NEVER be cancelled automatically because no worker
 *   accepted, the booking went stale, the dispatch window expired, or an SLA
 *   expired. Only the USER, an ADMIN, or an explicit authorized manual
 *   cancellation flow may cancel a booking.
 *
 * What this job does now, for overdue unassigned bookings:
 *   1. Leaves status untouched (stays 'pending' / 'dispatched' / waiting).
 *   2. Re-triggers dispatch so newly available workers are offered the job.
 *   3. Logs an operational event: sla_expired_redispatch.
 *   4. Escalates to admin (Telegram) past the escalation threshold.
 *   5. Reconciles refunds for bookings cancelled by a USER or ADMIN
 *      (legitimate cancellations only — it never creates cancellations).
 *
 * It intentionally does NOT call auto_cancel_stale_instant_bookings().
 * That DB function must also be neutralised on the external database —
 * see docs/disable-automatic-booking-cancellation.sql (it may be wired to a
 * pg_cron job that runs independently of this edge function).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";
import { refundBookingToWallet } from "../_shared/refundAmount.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Waiting bookings older than this get a redispatch nudge.
const STALE_MINUTES = 20;
// Waiting this long without assignment gets escalated to admin.
const ESCALATE_MINUTES = 90;
// Bounded work per run.
const MAX_BOOKINGS_PER_RUN = 50;

// Statuses that mean "still waiting for a worker" — never terminal.
const WAITING_STATUSES = ["pending", "dispatched", "waiting_for_worker"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const summary = {
    success: true,
    waiting_bookings: 0,
    redispatched: 0,
    escalated: 0,
    refunds_reconciled: 0,
    cancelled: 0, // always 0 — this job never cancels
    timestamp: new Date().toISOString(),
  };

  try {
    if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("EXTERNAL_SUPABASE credentials not configured");
    }
    const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = Date.now();
    const staleBefore = new Date(now - STALE_MINUTES * 60 * 1000).toISOString();

    // ---------------------------------------------------------------------
    // 1. Overdue but still-waiting bookings → redispatch, never cancel.
    // ---------------------------------------------------------------------
    const { data: waiting, error: waitErr } = await admin
      .from("bookings")
      .select("id, user_id, status, service_type, community, booking_type, created_at, worker_id")
      .in("status", WAITING_STATUSES)
      .is("worker_id", null)
      .is("cancelled_at", null)
      .lt("created_at", staleBefore)
      .order("created_at", { ascending: true })
      .limit(MAX_BOOKINGS_PER_RUN);

    if (waitErr) {
      console.error("[sla-checker] waiting_query_failed", waitErr.message);
    }

    summary.waiting_bookings = (waiting || []).length;

    for (const b of waiting || []) {
      const ageMin = Math.round((now - new Date(b.created_at as string).getTime()) / 60000);

      console.log(
        `[sla-checker] sla_expired_redispatch booking=${b.id} status=${b.status} service=${b.service_type} community=${b.community} age_min=${ageMin} action=keep_waiting_and_redispatch auto_cancel_blocked=true`,
      );

      // Re-trigger dispatch. Offer dedup, eligibility, priority, availability
      // and capacity all remain the dispatcher's responsibility — this only
      // asks it to look again, so newly available workers get the offer.
      try {
        const res = await fetch(
          `${EXTERNAL_SUPABASE_URL}/functions/v1/dispatch-pending-bookings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ booking_id: b.id, source: "sla_checker_redispatch" }),
          },
        );
        if (res.ok) {
          summary.redispatched++;
        } else {
          console.error(
            `[sla-checker] redispatch_failed booking=${b.id} status=${res.status}`,
          );
        }
      } catch (e) {
        console.error(`[sla-checker] redispatch_error booking=${b.id}`, (e as Error).message);
      }

      // Escalate long waits to admin. Escalation is a notification only.
      if (ageMin >= ESCALATE_MINUTES) {
        console.warn(
          `[sla-checker] sla_escalated_to_admin booking=${b.id} age_min=${ageMin}`,
        );
        try {
          await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/send-telegram-alert`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              message:
                `⏳ Booking still unassigned\n` +
                `ID: ${b.id}\n` +
                `Service: ${b.service_type}\n` +
                `Community: ${b.community}\n` +
                `Waiting: ${ageMin} min\n` +
                `Status: ${b.status} (kept waiting — auto-cancel disabled by policy)`,
            }),
          });
          summary.escalated++;
        } catch (e) {
          console.error(`[sla-checker] escalation_failed booking=${b.id}`, (e as Error).message);
        }
      }
    }

    // ---------------------------------------------------------------------
    // 2. Refund reconciliation for bookings cancelled by USER or ADMIN.
    //    This never creates a cancellation; it only tops up a shortfall on
    //    already-cancelled bookings, idempotently.
    // ---------------------------------------------------------------------
    try {
      const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const { data: cancelled } = await admin
        .from("bookings")
        .select("id, user_id")
        .eq("status", "cancelled")
        .in("payment_status", ["paid", "moved_to_wallet"])
        .gte("cancelled_at", since)
        .limit(200);

      for (const b of cancelled || []) {
        if (!b?.user_id) continue;
        const res = await refundBookingToWallet(
          admin,
          b.id as string,
          b.user_id as string,
          "cancelled",
        );
        if ((res as any)?.refunded) summary.refunds_reconciled++;
      }
    } catch (e) {
      console.error("[sla-checker] refund_reconciliation_failed", (e as Error).message);
    }

    console.log(
      `[sla-checker] run_done waiting=${summary.waiting_bookings} redispatched=${summary.redispatched} escalated=${summary.escalated} refunds=${summary.refunds_reconciled} cancelled=0`,
    );

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sla-checker] exception", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message, cancelled: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
