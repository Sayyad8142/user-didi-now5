// Shared instant-booking capacity rules.
// Single source of truth for both the pre-payment gate
// (check-booking-capacity) and the order gate inside
// create-razorpay-order. Mirrored by the DB trigger in
// docs/service-capacity-migration.sql.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Statuses that occupy an instant-booking slot.
// Scheduled bookings are excluded via booking_type='instant'.
export const ACTIVE_INSTANT_STATUSES = [
  "pending",
  "dispatched",
  "accepted",
  "confirmed",
  "on_the_way",
  "in_progress",
] as const;

// Per-service max active instant bookings per community.
// Keys must match `bookings.service_type` values.
export const SERVICE_INSTANT_LIMITS: Record<string, number> = {
  maid: 3,            // floor cleaning / maid
  bathroom_cleaning: 1,
  dishwashing: 2,
  dish_washing: 2,
  floor_cleaning: 3,
};

export const DEFAULT_INSTANT_LIMIT = 3;

export function limitForService(serviceType: string | null | undefined): number {
  if (!serviceType) return DEFAULT_INSTANT_LIMIT;
  return SERVICE_INSTANT_LIMITS[serviceType] ?? DEFAULT_INSTANT_LIMIT;
}

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/^['"]|['"]$/g, "");
  const eq = v.indexOf("=");
  if (eq > -1 && v.slice(0, eq).includes("KEY")) {
    v = v.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return v;
}

// Build a client that always points at the EXTERNAL Supabase
// (api.didisnow.com) where the real `bookings` table lives.
// Lovable Cloud does not expose EXTERNAL_SUPABASE_URL by default in
// every function isolate, so mirror the production DB URL fallback used
// by bootstrap-profile/create-paid-booking while still requiring a
// service-role key from secrets.
export function getExternalSupabase() {
  const url =
    cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
    cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
    "https://paywwbuqycovjopryele.supabase.co";
  const key =
    cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
    cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) {
    throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  console.log(`[capacityRules] using DB host=${new URL(url).host}`);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CapacityResult {
  active_count: number;
  limit: number;
  is_full: boolean;
}

// Counts active instant bookings for a (community, service_type) pair
// using the EXTERNAL DB. Throws on any error — callers MUST fail-closed.
export async function countActiveInstantBookings(
  community: string,
  serviceType: string,
): Promise<CapacityResult> {
  const supabase = getExternalSupabase();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("community", community)
    .eq("service_type", serviceType)
    .eq("booking_type", "instant")
    .in("status", ACTIVE_INSTANT_STATUSES as unknown as string[]);

  if (error) {
    throw new Error(`capacity_count_failed: ${error.message}`);
  }

  const active = Number(count) || 0;
  const limit = limitForService(serviceType);
  return { active_count: active, limit, is_full: active >= limit };
}
