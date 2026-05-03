// Support Chat bridge for Firebase-authenticated users.
// This app uses Firebase phone auth on the frontend, but existing RLS/RPC expects Supabase Auth.
// This function verifies Firebase ID tokens, maps them to a profile row, and performs support chat DB operations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token",
};

const FIREBASE_API_KEY = Deno.env.get("FIREBASE_API_KEY") || "";
if (!FIREBASE_API_KEY) {
  console.error("Missing FIREBASE_API_KEY environment variable");
}

type Action =
  | "get_thread"
  | "list_messages"
  | "send_message"
  | "mark_seen"
  | "unseen";

type Json = Record<string, unknown>;

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; phone?: string | null; email?: string | null }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  const json = (await res.json()) as any;

  if (!res.ok) {
    console.log("❌ Firebase token verify failed:", json);
    throw new Error(json?.error?.message || "Invalid Firebase token");
  }

  const user = json?.users?.[0];
  const uid = user?.localId as string | undefined;
  if (!uid) throw new Error("Invalid Firebase token payload");

  return {
    uid,
    phone: (user?.phoneNumber as string | undefined) ?? null,
    email: (user?.email as string | undefined) ?? null,
  };
}

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const tokenHeader = req.headers.get("x-firebase-token") || req.headers.get("authorization") || "";
    const idToken = tokenHeader.startsWith("Bearer ") ? tokenHeader.slice("Bearer ".length) : tokenHeader;

    if (!idToken) {
      return jsonResponse({ error: "Missing Firebase token" }, 401);
    }

    const { uid, phone } = await verifyFirebaseIdToken(idToken);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log("❌ Missing Supabase env vars", { hasUrl: !!SUPABASE_URL, hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY });
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = (await req.json().catch(() => ({}))) as any;
    const action = payload?.action as Action | undefined;

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    console.log("➡️ support-chat", { action, uid });

    // Ensure we have a profile UUID for this Firebase UID
    const { data: existingProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, firebase_uid")
      .eq("firebase_uid", uid)
      .maybeSingle();

    if (profileErr) {
      console.log("❌ profiles select error:", profileErr);
      return jsonResponse({ error: "Failed to load profile" }, 500);
    }

    let profileId = existingProfile?.id as string | undefined;

    if (!profileId) {
      console.log("📝 Creating missing profile row for uid", uid);

      const { data: created, error: createErr } = await supabaseAdmin
        .from("profiles")
        .insert({
          firebase_uid: uid,
          phone: phone ?? "",
          full_name: "User",
          community: "other",
          flat_no: "",
          is_admin: false,
        })
        .select("id")
        .single();

      if (createErr) {
        console.log("❌ profiles insert error:", createErr);
        return jsonResponse({ error: "Failed to create profile" }, 500);
      }

      profileId = created.id as string;
    }

    // Helpers
    const normalizeBookingId = (b: unknown) => (typeof b === "string" && b.length > 0 ? b : null);

    const getOrCreateThread = async (bookingId: string | null) => {
      // First try to find existing thread
      let q = supabaseAdmin
        .from("support_threads")
        .select("*")
        .eq("user_id", profileId!)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (bookingId) q = q.eq("booking_id", bookingId);
      else q = q.is("booking_id", null);

      const { data: existing, error } = await q;
      if (error) throw error;

      if (existing?.[0]) return existing[0];

      // Try to insert, but handle duplicate key gracefully (race condition)
      const { data: created, error: createErr } = await supabaseAdmin
        .from("support_threads")
        .insert({
          user_id: profileId!,
          booking_id: bookingId,
          last_message: null,
          last_sender: null,
        })
        .select("*")
        .single();

      if (createErr) {
        // If duplicate key error, just re-fetch the existing thread
        if (createErr.message?.includes("duplicate key") || createErr.code === "23505") {
          console.log("⚠️ Duplicate thread detected, re-fetching...");
          let retryQ = supabaseAdmin
            .from("support_threads")
            .select("*")
            .eq("user_id", profileId!)
            .order("updated_at", { ascending: false })
            .limit(1);

          if (bookingId) retryQ = retryQ.eq("booking_id", bookingId);
          else retryQ = retryQ.is("booking_id", null);

          const { data: retryData, error: retryErr } = await retryQ;
          if (retryErr) throw retryErr;
          if (retryData?.[0]) return retryData[0];
          throw new Error("Thread not found after duplicate key conflict");
        }
        throw createErr;
      }
      return created;
    };

    const assertThreadOwned = async (threadId: string) => {
      const { data, error } = await supabaseAdmin
        .from("support_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", profileId!)
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        return false;
      }
      return true;
    };

    // Actions
    if (action === "get_thread") {
      const bookingId = normalizeBookingId(payload?.bookingId);
      const thread = await getOrCreateThread(bookingId);
      return jsonResponse({ thread });
    }

    if (action === "list_messages") {
      const threadId = payload?.threadId as string | undefined;
      if (!threadId) return jsonResponse({ error: "Missing threadId" }, 400);

      const ok = await assertThreadOwned(threadId);
      if (!ok) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("support_messages")
        .select("id, thread_id, sender, message, created_at, seen, seen_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return jsonResponse({ messages: data ?? [] });
    }

    if (action === "send_message") {
      const threadId = payload?.threadId as string | undefined;
      const message = (payload?.message as string | undefined)?.trim();
      const sender = payload?.sender as string | undefined;

      console.log("📝 send_message received:", { threadId, message: message?.substring(0, 50), sender });

      if (!threadId) return jsonResponse({ error: "Missing threadId" }, 400);
      if (!message) return jsonResponse({ error: "Missing message" }, 400);
      if (sender !== "user") return jsonResponse({ error: "Only user messages allowed" }, 403);

      console.log("📝 Checking thread ownership...");
      const ok = await assertThreadOwned(threadId);
      if (!ok) return jsonResponse({ error: "Forbidden" }, 403);
      console.log("✅ Thread ownership confirmed");

      console.log("📝 Inserting message...");
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("support_messages")
        .insert({
          thread_id: threadId,
          sender: "user",
          message,
          seen: false,
        })
        .select("*")
        .single();

      if (insertErr) {
        console.log("❌ Insert message error:", insertErr);
        throw insertErr;
      }
      console.log("✅ Message inserted:", inserted?.id);

      console.log("📝 Updating thread metadata...");
      const { error: threadErr } = await supabaseAdmin
        .from("support_threads")
        .update({
          last_message: message,
          last_sender: "user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId);

      if (threadErr) console.log("⚠️ support_threads update error:", threadErr);
      else console.log("✅ Thread updated");

      // --- Send admin push notification ---
      try {
        const { data: profileData } = await supabaseAdmin
          .from("profiles")
          .select("full_name, phone")
          .eq("id", profileId!)
          .maybeSingle();

        const userName = profileData?.full_name || profileData?.phone || "User";
        const truncMsg = message.length > 80 ? message.substring(0, 80) + "…" : message;

        const SUPABASE_URL_VAL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Fire admin FCM push
        fetch(`${SUPABASE_URL_VAL}/functions/v1/send-admin-fcm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            title: `💬 ${userName}`,
            body: truncMsg,
            notification_type: "support_chat",
            data: { thread_id: threadId, user_name: userName },
          }),
        }).catch((e) => console.log("⚠️ Admin FCM fire-and-forget error:", e));

        // Fire Telegram notification
        const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          const tgMessage = `💬 Support Chat\nFrom: ${userName}\nMessage: ${truncMsg}`;
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: tgMessage }),
          }).catch((e) => console.log("⚠️ Telegram fire-and-forget error:", e));
        } else {
          console.log("⚠️ Telegram credentials not configured, skipping");
        }

        console.log("✅ Admin notifications triggered");
      } catch (notifErr) {
        console.log("⚠️ Non-critical notification error:", notifErr);
      }

      return jsonResponse({ message: inserted });
    }

    if (action === "mark_seen") {
      const threadId = payload?.threadId as string | undefined;
      if (!threadId) return jsonResponse({ error: "Missing threadId" }, 400);

      const ok = await assertThreadOwned(threadId);
      if (!ok) return jsonResponse({ error: "Forbidden" }, 403);

      const { error } = await supabaseAdmin
        .from("support_messages")
        .update({ seen: true, seen_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .eq("sender", "admin")
        .eq("seen", false);

      if (error) throw error;

      return jsonResponse({ ok: true });
    }

    if (action === "unseen") {
      // Default: general support thread (booking_id null)
      const bookingId = normalizeBookingId(payload?.bookingId);
      const thread = await getOrCreateThread(bookingId);

      const { data, error } = await supabaseAdmin
        .from("support_messages")
        .select("id")
        .eq("thread_id", thread.id)
        .eq("sender", "admin")
        .eq("seen", false);

      if (error) throw error;

      return jsonResponse({ threadId: thread.id, unseen: (data ?? []).length });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.log("❌ support-chat error:", e?.message ?? e, e);
    return jsonResponse({ error: e?.message ?? "Unknown error" }, 500);
  }
});
