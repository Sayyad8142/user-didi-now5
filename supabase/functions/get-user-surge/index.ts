/**
 * get-user-surge — authoritative per-user loyalty surge for the client quote.
 *
 * ROOT CAUSE THIS FIXES:
 * The app used to count the user's completed bookings directly from the
 * client (`supabase.from('bookings').select(count)`). Those rows live on the
 * EXTERNAL project and anon reads are denied (PostgREST 42501), so the hook
 * silently resolved to 0 for EVERY Firebase-authenticated user. The client
 * therefore quoted `loyalty_surge_amount = 0` while create-razorpay-order /
 * create-paid-booking computed the real surge (e.g. ₹10) and rejected the
 * payment with "Price has changed. Please refresh and try again."
 *
 * This function runs with the service role against the same external DB and
 * uses the exact same shared helper the payment validators use, so the client
 * quote and the server validation can never disagree.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import { getExpectedSurge, LOYALTY_SURGE_LAUNCH_DATE } from "../_shared/userSurge.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(idToken);
    } catch (e) {
      console.warn("[get-user-surge] token verify failed:", (e as Error).message);
      return json({ error: "Authentication expired, please login again" }, 401);
    }

    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();

    if (profileErr) {
      console.error("[get-user-surge] profile lookup failed:", profileErr.message);
      return json({ error: "Could not resolve profile" }, 500);
    }

    // Guest / not-yet-bootstrapped profile → base price.
    if (!profile) {
      return json({ surge_amount: 0, completed_count: 0, source: "no_profile" });
    }

    const surgeAmount = await getExpectedSurge(supabase, profile.id);

    // Completed count is only used for the UI tier label / "next tier" hint.
    let completedCount = 0;
    try {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "completed")
        .gte("created_at", LOYALTY_SURGE_LAUNCH_DATE);
      completedCount = count ?? 0;
    } catch (_e) {
      completedCount = 0;
    }

    console.log(
      `[get-user-surge] profile=${profile.id} surge=₹${surgeAmount} completed_since_${LOYALTY_SURGE_LAUNCH_DATE}=${completedCount}`,
    );

    return json({
      surge_amount: surgeAmount,
      completed_count: completedCount,
      source: "server",
    });
  } catch (err) {
    console.error("[get-user-surge] unexpected error:", (err as Error).message);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
