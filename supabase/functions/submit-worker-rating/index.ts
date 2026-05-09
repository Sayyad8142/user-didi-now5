import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const cleanSecret = (v?: string | null) => (v ? v.trim().replace(/^['"]|['"]$/g, "") : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const idToken = extractToken(req);
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUser = await verifyFirebaseToken(idToken);

    const { booking_id, rating, comment } = await req.json();
    if (!booking_id || typeof rating !== "number" || rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({ error: "booking_id and rating (1-5) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Target the external DB that owns profiles/bookings (matches bootstrap-profile)
    const supabaseUrl =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const serviceRoleKey =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[submit-worker-rating] using DB host:", new URL(supabaseUrl).host, "uid:", firebaseUser.uid);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();

    if (profileErr) {
      console.error("profile lookup error:", profileErr);
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from("bookings")
      .select("id, user_id, worker_id, status")
      .eq("id", booking_id)
      .maybeSingle();

    if (fetchErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.user_id !== profile.id) {
      return new Response(JSON.stringify({ error: "Not your booking" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.worker_id) {
      return new Response(JSON.stringify({ error: "No worker assigned to this booking" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: upsertErr } = await supabase
      .from("worker_ratings")
      .upsert(
        {
          booking_id,
          worker_id: booking.worker_id,
          user_id: profile.id,
          rating,
          comment: comment ? String(comment).trim() || null : null,
        },
        { onConflict: "booking_id" }
      );

    if (upsertErr) {
      console.error("worker_ratings upsert error:", upsertErr);
      return new Response(JSON.stringify({ error: upsertErr.message || "Failed to save rating" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-worker-rating error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
