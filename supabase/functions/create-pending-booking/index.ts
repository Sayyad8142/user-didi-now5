/**
 * create-pending-booking — COD / pay-after-service booking creation.
 *
 * The frontend Supabase client is anonymous (Firebase identity), so direct
 * INSERTs into `bookings` are blocked by RLS. This function authenticates
 * the user via Firebase, resolves the profile, and inserts the row using
 * the service role — mirroring the architecture of `create-paid-booking`
 * but without payment verification.
 *
 * Used for:
 *   - "Pay after service" bookings (admin opt-in flag)
 *   - COD-only kill-switch path (when online payments are disabled)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyFirebaseToken,
  extractToken,
  corsHeaders,
} from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OPTIONAL_BOOKING_INSERT_COLUMNS = new Set([
  "building_id",
  "community_id",
  "flat_id",
  "preferred_worker_id",
  "dish_intensity",
  "dish_intensity_extra_inr",
  "has_glass_partition",
  "glass_partition_fee",
  "surcharge_amount",
  "surcharge_reason",
]);

function extractMissingColumnName(message?: string): string | null {
  if (!message) return null;
  const patterns = [
    /Could not find the '([^']+)' column of 'bookings' in the schema cache/i,
    /column(?:\s+"|\s+)([^"\s]+)(?:"|\s+)of relation(?:\s+"|\s+)bookings(?:"|\s+)does not exist/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function insertWithCompat(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  const current = { ...row };
  for (let attempt = 0; attempt <= OPTIONAL_BOOKING_INSERT_COLUMNS.size; attempt++) {
    const result = await supabase
      .from("bookings")
      .insert([current])
      .select("id, booking_type, status")
      .single();

    if (!result.error) return result;

    const missing = extractMissingColumnName(result.error.message);
    if (
      !missing ||
      !OPTIONAL_BOOKING_INSERT_COLUMNS.has(missing) ||
      !(missing in current)
    ) {
      return result;
    }
    console.warn(`[create-pending-booking] Stripping unsupported column: ${missing}`);
    delete current[missing];
  }
  return { data: null, error: { message: "Exceeded compat retry attempts" } as any };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server configuration error" }, 500);
    }

    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);

    const { booking_data: rawBookingData } = await req.json();
    if (!rawBookingData || typeof rawBookingData !== "object") {
      return json({ error: "booking_data required" }, 400);
    }

    const booking_data = { ...rawBookingData } as Record<string, unknown>;
    delete booking_data.request_id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve profile from Firebase UID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) return json({ error: "Profile not found" }, 404);

    // Force the user_id server-side (don't trust the client)
    booking_data.user_id = profile.id;

    // Sanity guard: this function is for non-online payments only
    const ps = booking_data.payment_status;
    if (ps !== "pending" && ps !== "pay_after_service") {
      return json({ error: "Invalid payment_status for pending booking" }, 400);
    }

    const result = await insertWithCompat(supabase, booking_data);

    if (result.error) {
      console.error("[create-pending-booking] insert failed:", result.error);
      return json({ error: result.error.message || "Insert failed" }, 400);
    }

    return json({ success: true, booking: result.data });
  } catch (err) {
    console.error("[create-pending-booking] fatal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
