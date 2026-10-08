// Self-service account deletion.
// Auth: Firebase ID token in x-firebase-token (the app has no Supabase session,
// so DB RPCs like delete_my_data always failed as anon — the root cause).
//
// Flow:
//  1. Verify Firebase token -> profile (by firebase_uid).
//  2. Block if the customer has active bookings or in-flight pending payments.
//  3. If the wallet holds money, require explicit `acknowledge_wallet_forfeit`.
//  4. Anonymise the profile (bookings, payments, wallet ledger, payouts are KEPT
//     for legal/accounting integrity and still point at the same profile id).
//  5. Remove push tokens, delete the Firebase user (kills all sessions).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const ACTIVE_BOOKING_STATUSES = [
  "pending", "dispatched", "assigned", "accepted", "confirmed",
  "on_the_way", "reached", "started", "in_progress",
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Update that drops columns the DB doesn't have (schema-adaptive).
async function adaptiveUpdate(db: any, table: string, values: Record<string, unknown>, id: string) {
  const v = { ...values };
  for (let i = 0; i < 10; i++) {
    const { error } = await db.from(table).update(v).eq("id", id);
    if (!error) return null;
    const m = /column ['"]?([a-z_]+)['"]? .*(does not exist|schema cache)/i.exec(error.message || "")
      || /Could not find the '([a-z_]+)' column/i.exec(error.message || "");
    if (m && m[1] in v) { delete v[m[1]]; continue; }
    return error;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let fb;
  try {
    const token = extractToken(req);
    if (!token) return json({ error: "unauthorized", message: "Please sign in again." }, 401);
    fb = await verifyFirebaseToken(token);
  } catch {
    return json({ error: "unauthorized", message: "Your session expired. Please sign in again." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const acknowledgeWallet = body?.acknowledge_wallet_forfeit === true;
  const db = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { data: profile, error: pErr } = await db
      .from("profiles").select("id, phone").eq("firebase_uid", fb.uid).maybeSingle();
    if (pErr) throw pErr;

    if (profile) {
      // Active bookings must finish or be cancelled first (cancellation refunds to wallet).
      const { data: active, error: bErr } = await db
        .from("bookings").select("id").eq("user_id", profile.id)
        .in("status", ACTIVE_BOOKING_STATUSES).limit(1);
      if (bErr) throw bErr;
      if (active && active.length > 0) {
        return json({
          error: "active_bookings",
          message: "You have an ongoing or upcoming booking. Please cancel it or wait until it is completed, then try again.",
        }, 409);
      }

      // In-flight payments (paid but booking not yet created) must settle first.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: pend } = await db
        .from("pending_bookings").select("id, status").eq("user_id", profile.id)
        .gte("created_at", since).limit(5);
      if ((pend || []).some((p: any) => !["completed", "converted", "failed", "cancelled", "expired", "refunded"].includes(String(p.status)))) {
        return json({
          error: "payment_in_progress",
          message: "A payment is still being processed. Please wait a few minutes and try again.",
        }, 409);
      }

      const { data: wallet } = await db
        .from("user_wallets").select("balance_inr").eq("user_id", profile.id).maybeSingle();
      const balance = Number(wallet?.balance_inr ?? 0);
      if (balance > 0 && !acknowledgeWallet) {
        return json({
          error: "wallet_balance",
          balance_inr: balance,
          message: `Your wallet still has ₹${balance}. This balance will be lost if you delete your account.`,
        }, 409);
      }

      // Anonymise personal data. Keep the row so bookings/payments/payouts stay intact.
      const updErr = await adaptiveUpdate(db, "profiles", {
        full_name: "Deleted User",
        phone: `deleted:${profile.id}`,
        firebase_uid: null,
        email: null,
        avatar_url: null,
        flat_no: null,
        flat_id: null,
        building_id: null,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, profile.id);
      if (updErr) throw updErr;

      await db.from("user_fcm_tokens").delete().eq("user_id", profile.id);
      console.log(`[delete-account] anonymised profile=${profile.id} wallet_forfeit=${balance}`);
    }

    // Delete Firebase identity → existing tokens can no longer be refreshed.
    const apiKey = Deno.env.get("FIREBASE_API_KEY");
    const token = extractToken(req);
    if (apiKey) {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
      if (!r.ok) console.warn("[delete-account] firebase delete failed", r.status, await r.text());
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("[delete-account] failed", e?.message || e);
    return json({ error: "server_error", message: "We couldn't delete your account right now. Please try again." }, 500);
  }
});
