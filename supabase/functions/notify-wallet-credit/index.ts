/**
 * notify-wallet-credit — Send push notification when money is added to a user's wallet.
 *
 * Called via pg_net from the production DB trigger on wallet_transactions INSERT (type = 'credit').
 * Also callable manually from admin tools.
 *
 * Payload:
 *   { user_id: string, amount: number, reason?: string, source?: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const { user_id, amount, reason, source } = await req.json();

    if (!user_id || !amount) {
      return json({ error: "user_id and amount required" }, 400);
    }

    const amountNum = Number(amount);
    if (amountNum <= 0) {
      return json({ error: "amount must be positive" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Build notification message
    const amountStr = `₹${amountNum.toFixed(0)}`;
    let title = "Money Added to Wallet 💰";
    let body = `${amountStr} has been added to your Didi Now wallet.`;

    if (source === "refund" || reason?.toLowerCase().includes("refund")) {
      title = "Refund Credited 💰";
      body = `${amountStr} refund has been added to your wallet.`;
    } else if (source === "admin") {
      title = "Wallet Credited 💰";
      body = `${amountStr} has been added to your wallet by Didi Now.`;
    } else if (reason) {
      body = `${amountStr} added — ${reason}`;
    }

    console.log(`[notify-wallet-credit] Sending to ${user_id}: ${title} — ${body}`);

    // Call the existing send-user-fcm edge function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-user-fcm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id,
        title,
        body,
        data: {
          type: "WALLET_CREDIT",
          amount: String(amountNum),
          deep_link: "/wallet",
        },
      }),
    });

    const result = await response.json();
    console.log(`[notify-wallet-credit] FCM result:`, JSON.stringify(result));

    return json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[notify-wallet-credit] Error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
