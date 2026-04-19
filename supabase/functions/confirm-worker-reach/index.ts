import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const { booking_id, reached } = await req.json();
    if (!booking_id || typeof reached !== "boolean") {
      return new Response(JSON.stringify({ error: "booking_id and reached (boolean) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch booking and verify ownership
    const { data: booking, error: fetchErr } = await supabase
      .from("bookings")
      .select("id, user_id, worker_id, reach_status, worker_name, flat_no, community, service_type")
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

    // Idempotent: if already confirmed, return current status without error
    if (booking.reach_status && booking.reach_status !== "pending") {
      return new Response(JSON.stringify({
        ok: true,
        reach_status: booking.reach_status,
        already_confirmed: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update reach status
    const newStatus = reached ? "reached" : "not_reached";
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        reach_status: newStatus,
        reach_confirmed_at: new Date().toISOString(),
        reach_confirmed_by: "user",
      })
      .eq("id", booking_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to update" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send alerts for "not reached" (fire-and-forget)
    if (!reached) {
      const workerName = booking.worker_name || "Worker";
      const flatNo = booking.flat_no || "Unknown";
      const community = booking.community || "";
      const serviceType = booking.service_type || "Service";

      // Admin FCM
      fetch(`${SUPABASE_URL}/functions/v1/send-admin-fcm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          title: "⚠️ Worker Not Reached",
          body: `${workerName} has not reached Flat ${flatNo} (${community}) for ${serviceType}. Action needed!`,
          notification_type: "worker_not_reached",
          data: { booking_id, worker_name: workerName, flat_no: flatNo, community, service_type: serviceType },
        }),
      }).catch((e) => console.error("Admin FCM error:", e));

      // Telegram
      fetch(`${SUPABASE_URL}/functions/v1/send-telegram-alert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          message: `⚠️ WORKER NOT REACHED\nWorker: ${workerName}\nFlat: ${flatNo} (${community})\nService: ${serviceType}\nBooking ID: ${booking_id}\nAction needed immediately!`,
        }),
      }).catch((e) => console.error("Telegram error:", e));
    }

    return new Response(JSON.stringify({ ok: true, reach_status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("confirm-worker-reach error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
