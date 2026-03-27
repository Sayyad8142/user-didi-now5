/**
 * Wallet Pay Edge Function — thin wrapper around debit_wallet_for_booking RPC.
 * All money logic lives in the DB function (atomic, idempotent, row-locked).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 1. Authenticate via Firebase
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);

    // 2. Parse request
    const { booking_id } = await req.json();
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Resolve profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) return json({ error: "Profile not found" }, 404);

    // 4. Call the atomic RPC — all money logic is in the DB
    const { data: result, error: rpcErr } = await supabase.rpc(
      "debit_wallet_for_booking",
      { p_user_id: profile.id, p_booking_id: booking_id, p_amount: 0 },
    );

    if (rpcErr) {
      console.error("[wallet-pay] RPC error:", rpcErr.message);
      return json({ error: "Wallet debit failed: " + rpcErr.message }, 500);
    }

    // RPC returns jsonb — handle DB-level errors
    if (result?.error) {
      const code = result.error === "booking_not_found" ? 404
        : result.error === "not_owner" ? 403
        : 400;
      return json({ error: result.error }, code);
    }

    // 5. If fully paid by wallet and instant booking → trigger dispatch
    if (result.fully_paid && !result.already_paid && !result.already_debited) {
      // Fetch booking type to decide dispatch
      const { data: booking } = await supabase
        .from("bookings")
        .select("booking_type, status")
        .eq("id", booking_id)
        .single();

      if (booking?.booking_type === "instant" && booking?.status === "pending") {
        console.log(`[wallet-pay] 🚀 Dispatching wallet-paid instant booking ${booking_id}`);
        try {
          const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
            p_booking_id: booking_id,
          });
          if (dispatchErr) {
            console.warn("[wallet-pay] dispatch RPC failed, calling edge fn:", dispatchErr.message);
            await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ booking_id }),
            });
          }
        } catch (e) {
          console.error("[wallet-pay] Dispatch error (non-blocking):", e);
        }
      }
    }

    console.log(`[wallet-pay] ✅ Result for booking ${booking_id}:`, JSON.stringify(result));
    return json(result);
  } catch (err: any) {
    console.error("[wallet-pay] Error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
