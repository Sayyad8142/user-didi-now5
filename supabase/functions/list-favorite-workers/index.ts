// ============================================================================
// list-favorite-workers
// Authenticated service-role proxy for get_favorite_workers on the external DB.
//
// Why this exists: the app's Supabase client is anonymous (identity comes from
// Firebase), and the external DB does NOT grant EXECUTE on
// public.get_favorite_workers to anon/authenticated. The direct client RPC
// therefore fails with Postgres 42501 ("permission denied for function
// get_favorite_workers"), which made the "Choose your favorite worker" screen
// render as an empty list.
//
// This proxy verifies the Firebase ID token, maps it to the profile id
// server-side (never trusts a client-supplied user id), and runs the RPC with
// the service role. If the RPC itself is unavailable it falls back to computing
// the history directly from completed bookings so the screen never goes blank.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const serviceType = String(body?.service_type || "").trim();
    const community = String(body?.community || "").trim();
    const clientError = body?.client_rpc_error as string | undefined;

    if (!serviceType || !community) {
      return json({ error: "service_type and community are required", workers: [] }, 400);
    }

    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Missing Firebase token", workers: [] }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const phone = normalizePhone(fb.phone || "");

    if (!EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server misconfigured", workers: [] }, 500);
    }

    const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve the caller's profile id server-side.
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

    if (!profile?.id) return json({ workers: [], source: "no_profile" });

    if (clientError) {
      console.error(
        `[list-favorite-workers] CLIENT_RPC_DENIED get_favorite_workers service=${serviceType} community=${community} error="${clientError}"`,
      );
    }

    // Primary path: authoritative RPC with the service role.
    const { data, error } = await admin.rpc("get_favorite_workers", {
      p_service: serviceType,
      p_community: community,
      p_user_id: profile.id,
    });

    if (!error) {
      return json({ workers: data ?? [], source: "service_role_rpc" });
    }

    console.error("[list-favorite-workers] rpc failed", error.code, error.message);

    // Fallback: derive the history straight from completed bookings.
    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select("worker_id,created_at")
      .eq("user_id", profile.id)
      .eq("service_type", serviceType)
      .eq("community", community)
      .eq("status", "completed")
      .not("worker_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (bookingsError) {
      return json({ error: bookingsError.message, workers: [] }, 500);
    }

    const lastBookingByWorker = new Map<string, string>();
    for (const b of bookings || []) {
      const wid = String((b as any).worker_id);
      if (!lastBookingByWorker.has(wid)) {
        lastBookingByWorker.set(wid, (b as any).created_at);
      }
    }
    const workerIds = [...lastBookingByWorker.keys()];
    if (workerIds.length === 0) return json({ workers: [], source: "fallback_bookings" });

    const { data: workers, error: workersError } = await admin
      .from("workers")
      .select(
        "id,full_name,photo_url,rating,total_ratings,total_bookings_completed,is_active,is_available,is_busy,is_blocked,last_seen_at",
      )
      .in("id", workerIds);

    if (workersError) {
      return json({ error: workersError.message, workers: [] }, 500);
    }

    const now = Date.now();
    const rows = (workers || [])
      .filter((w: any) => w.is_active !== false && w.is_blocked !== true)
      .map((w: any) => {
        const seen = w.last_seen_at ? Date.parse(w.last_seen_at) : 0;
        return {
          worker_id: w.id,
          full_name: w.full_name || "Didi",
          photo_url: w.photo_url ?? null,
          rating_avg: Number(w.rating) || 0,
          rating_count: Number(w.total_ratings) || 0,
          completed_bookings_count: Number(w.total_bookings_completed) || 0,
          is_online:
            w.is_available === true &&
            w.is_busy !== true &&
            !!seen &&
            now - seen < ONLINE_WINDOW_MS,
          last_seen_at: w.last_seen_at ?? null,
          last_booking_at: lastBookingByWorker.get(String(w.id)) ?? null,
        };
      })
      .sort((a, b) => String(b.last_booking_at).localeCompare(String(a.last_booking_at)));

    return json({ workers: rows, source: "fallback_bookings", rpc_error: error.message });
  } catch (e: any) {
    console.error("[list-favorite-workers] unexpected", e?.message);
    return json({ error: e?.message || "Unexpected error", workers: [] }, 500);
  }
});
