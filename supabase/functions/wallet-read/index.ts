import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

type WalletAction = "get_balance" | "get_transactions";

type WalletRequest = {
  action?: WalletAction;
  limit?: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const idToken = extractToken(req);
    if (!idToken) {
      return jsonResponse({ error: "Missing Firebase token" }, 401);
    }

    const { uid } = await verifyFirebaseToken(idToken);
    const payload = (await req.json().catch(() => ({}))) as WalletRequest;

    if (!payload.action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[wallet-read] Missing env vars", {
        hasUrl: !!supabaseUrl,
        hasServiceRole: !!serviceRoleKey,
      });
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("firebase_uid", uid)
      .maybeSingle();

    if (profileError) {
      console.error("[wallet-read] Profile lookup failed", profileError);
      return jsonResponse({ error: "Failed to load profile" }, 500);
    }

    if (!profile?.id) {
      if (payload.action === "get_balance") {
        return jsonResponse({
          user_id: null,
          balance: 0,
          updated_at: new Date().toISOString(),
        });
      }

      return jsonResponse({ transactions: [] });
    }

    if (payload.action === "get_balance") {
      const { data: walletRow, error: walletError } = await supabaseAdmin
        .from("user_wallets")
        .select("user_id, balance_inr, updated_at")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (walletError) {
        console.error("[wallet-read] Balance lookup failed", walletError);
        return jsonResponse({ error: "Failed to load wallet balance" }, 500);
      }

      return jsonResponse({
        user_id: walletRow?.user_id ?? profile.id,
        balance: Number(walletRow?.balance_inr ?? 0),
        updated_at: walletRow?.updated_at ?? new Date().toISOString(),
      });
    }

    if (payload.action === "get_transactions") {
      const rawLimit = Number(payload.limit);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(100, rawLimit))
        : 50;

      const { data: rows, error: txError } = await supabaseAdmin
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (txError) {
        console.error("[wallet-read] Transaction lookup failed", txError);
        return jsonResponse({ error: "Failed to load wallet transactions" }, 500);
      }

      const transactions = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? `${row.created_at ?? Date.now()}-${Math.random()}`),
        user_id: String(row.user_id ?? profile.id),
        booking_id: typeof row.booking_id === "string" ? row.booking_id : null,
        type: row.type === "debit" ? "debit" : "credit",
        amount_inr: Number(row.amount_inr ?? row.amount ?? 0),
        reason: typeof row.reason === "string" ? row.reason : null,
        reference_type: typeof row.reference_type === "string" ? row.reference_type : null,
        reference_id: typeof row.reference_id === "string" ? row.reference_id : null,
        notes:
          typeof row.notes === "string"
            ? row.notes
            : typeof row.description === "string"
              ? row.description
              : null,
        created_at:
          typeof row.created_at === "string"
            ? row.created_at
            : new Date().toISOString(),
      }));

      return jsonResponse({ transactions });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error: any) {
    console.error("[wallet-read] Error", error);
    return jsonResponse({ error: error?.message || "Internal error" }, 500);
  }
});