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

    const { error: updateError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
        cancel_source: "user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .is("cancelled_at", null);

    if (updateError) {
      console.error("[cancel-booking] update failed", updateError);
      return jsonResponse({ error: updateError.message || "Failed to cancel booking" }, 500);
    }

    console.log(`[cancel-booking] cancelled booking=${bookingId} profile=${profile.id}`);

    // Wallet refund. A DB trigger may already have handled it; the RPC is
    // idempotent so calling it again is safe. If the RPC is unavailable we
    // fall back to a manual credit.
    let refund: unknown = null;
    const { data: refundData, error: refundError } = await admin.rpc("credit_wallet_on_cancel", {
      p_booking_id: bookingId,
      p_reason: "user_cancelled",
    });

    if (refundError) {
      console.error("[cancel-booking] credit_wallet_on_cancel failed", refundError);
      refund = await manualRefund(admin, bookingId, profile.id);
    } else {
      refund = refundData;
      console.log("[cancel-booking] refund result", JSON.stringify(refundData));
    }

    return jsonResponse({ success: true, refund });
  } catch (err) {
    console.error("[cancel-booking] unhandled", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
