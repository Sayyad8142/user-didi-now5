// Edge function: cancel-booking
// The app's Supabase client is anonymous (Firebase identity), so the
// public.user_cancel_booking RPC is unreachable ("permission denied for
// function user_cancel_booking") and its auth.uid() ownership check can
// never pass. This proxy verifies the Firebase ID token, maps to the
// profile id and performs the cancellation with the service role.
// DB triggers (wallet refund, notifications) still fire on the UPDATE.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";
import { refundBookingToWallet } from "../_shared/refundAmount.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const idToken = extractToken(req);
    if (!idToken) return jsonResponse({ error: "Missing Firebase token" }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const phone = normalizePhone(fb.phone || "");

    const body = await req.json().catch(() => ({} as any));
    const bookingId: string | undefined = body?.booking_id;
    const reason: string = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";
    if (!bookingId) return jsonResponse({ error: "booking_id required" }, 400);

    if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve the caller's profile id
    let { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("firebase_uid", fb.uid)
      .maybeSingle();

    if (!profile?.id && phone) {
      const { data: byPhone } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      profile = byPhone;
    }

    if (!profile?.id) return jsonResponse({ error: "Profile not found" }, 403);

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, user_id, status, cancelled_at, otp_verified_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("[cancel-booking] lookup failed", bookingError);
      return jsonResponse({ error: "Failed to load booking" }, 500);
    }
    if (!booking) return jsonResponse({ error: "booking_not_found" }, 404);
    if (booking.user_id !== profile.id) return jsonResponse({ error: "forbidden" }, 403);
    if (booking.cancelled_at || booking.status === "cancelled") {
      return jsonResponse({ success: true, already_cancelled: true });
    }
    if (booking.status === "completed" || booking.otp_verified_at) {
      return jsonResponse({ error: "already_completed" }, 409);
    }

    // Resilient cancellation: the external DB schema/triggers vary between
    // environments, so a single rigid UPDATE can fail with "column does not
    // exist" (42703 / PGRST204) or a trigger error and leave the user stuck.
    // Try progressively simpler payloads, then fall back to RPCs.
    const nowIso = new Date().toISOString();
    const attempts: Record<string, unknown>[] = [
      {
        status: "cancelled",
        cancelled_at: nowIso,
        cancel_reason: reason,
        cancel_source: "user",
        updated_at: nowIso,
      },
      { status: "cancelled", cancelled_at: nowIso, cancel_reason: reason, updated_at: nowIso },
      { status: "cancelled", cancelled_at: nowIso, updated_at: nowIso },
      { status: "cancelled", cancelled_at: nowIso },
      { status: "cancelled" },
    ];

    let cancelled = false;
    let lastError: any = null;

    for (const payload of attempts) {
      const { error } = await admin
        .from("bookings")
        .update(payload)
        .eq("id", bookingId)
        .is("cancelled_at", null);

      if (!error) {
        cancelled = true;
        break;
      }
      lastError = error;
      console.warn("[cancel-booking] update attempt failed", {
        code: error.code,
        message: error.message,
        keys: Object.keys(payload),
      });
      // Only retry with a smaller payload for schema mismatches; other errors
      // (triggers, constraints) won't be fixed by dropping columns.
      if (!["42703", "PGRST204", "PGRST116"].includes(String(error.code))) break;
    }

    // Last resort: server-side RPCs (may bypass problematic column paths).
    if (!cancelled) {
      for (const rpc of ["admin_cancel_booking", "user_cancel_booking", "cancel_booking"]) {
        const { error } = await admin.rpc(rpc, {
          p_booking_id: bookingId,
          p_reason: reason || "user_cancelled",
        });
        if (!error) {
          cancelled = true;
          console.log(`[cancel-booking] cancelled via RPC ${rpc}`);
          break;
        }
        console.warn(`[cancel-booking] RPC ${rpc} failed`, error.code, error.message);
      }
    }

    if (!cancelled) {
      // Verify — the row may already be cancelled by a concurrent request.
      const { data: recheck } = await admin
        .from("bookings")
        .select("status, cancelled_at")
        .eq("id", bookingId)
        .maybeSingle();
      if (recheck?.status === "cancelled" || recheck?.cancelled_at) {
        cancelled = true;
      }
    }

    if (!cancelled) {
      console.error("[cancel-booking] all cancellation paths failed", lastError);
      return jsonResponse(
        {
          error: lastError?.message || "Failed to cancel booking",
          code: lastError?.code || "cancel_failed",
        },
        500,
      );
    }

    console.log(`[cancel-booking] cancelled booking=${bookingId} profile=${profile.id}`);


    // Wallet refund — single authoritative resolver. The amount is always the
    // amount actually charged (wallet + razorpay captured, else
    // payment_amount_inr, else the price snapshotted on the booking).
    // Never recomputed from base price or current surge/discount rules.
    // A DB trigger may also have credited something; the resolver reconciles
    // the difference in either direction, idempotently.
    const refund = await refundBookingToWallet(
      admin,
      bookingId,
      profile.id,
      "user_cancelled",
    );
    console.log("[cancel-booking] refund result", JSON.stringify(refund));

    return jsonResponse({ success: true, refund });
  } catch (err) {
    console.error("[cancel-booking] unhandled", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
