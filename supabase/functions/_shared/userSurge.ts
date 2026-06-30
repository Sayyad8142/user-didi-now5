/**
 * Server-side per-user loyalty surge pricing.
 *
 * Mirrors src/lib/userSurge.ts so edge functions can VALIDATE
 * client-submitted prices and reject tampered/discounted requests.
 *
 * Tiers (must match client + docs/user-loyalty-surge.sql RPC):
 *   Bookings #1–3    → +₹0
 *   Bookings #4–6    → +₹10
 *   Bookings #7–10   → +₹30
 *   Bookings #11–14  → +₹60
 *   Each next tier of 4 → +₹30 more
 */

/**
 * Dynamic Pricing launch date — only bookings COMPLETED on or after this
 * date count toward the user's loyalty tier. Override with the
 * LOYALTY_SURGE_LAUNCH_DATE env var (ISO date, e.g. "2026-07-01").
 */
export const LOYALTY_SURGE_LAUNCH_DATE =
  Deno.env.get("LOYALTY_SURGE_LAUNCH_DATE") || "2026-07-01";

export function computeSurgeFromCount(completedCount: number): number {
  const bookingNumber = Math.max(0, completedCount) + 1;
  if (bookingNumber <= 3) return 0;
  if (bookingNumber <= 6) return 10;
  if (bookingNumber <= 10) return 30;
  const tiersAbove10 = Math.floor((bookingNumber - 11) / 4) + 1;
  return 30 + tiersAbove10 * 30;
}

/**
 * Returns the expected surge (₹) for this user's NEXT booking.
 *
 * Prefers the SQL RPC `get_user_surge_amount` (single source of truth).
 * Falls back to counting bookings client-side if the RPC is missing
 * (so deployments without the migration don't crash).
 *
 * Guests / missing user_id → 0 (base price).
 */
// deno-lint-ignore no-explicit-any
export async function getExpectedSurge(supabase: any, userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;

  try {
    const { data, error } = await supabase.rpc("get_user_surge_amount", { p_user_id: userId });
    if (!error && data !== null && data !== undefined) {
      // New RPC returns TABLE → array of rows with surge_amount.
      // Old RPC returned a scalar integer. Support both.
      const row = Array.isArray(data) ? data[0] : data;
      const raw = row && typeof row === "object" ? (row as any).surge_amount : row;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
    if (error) {
      console.warn("[userSurge] RPC failed, falling back to count:", error.message || error);
    }
  } catch (e) {
    console.warn("[userSurge] RPC threw, falling back to count:", (e as Error).message);
  }


  // Fallback: count non-cancelled bookings
  try {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("status", "in", `(${CANCELLED_STATUSES.join(",")})`);
    if (error) {
      console.warn("[userSurge] count fallback failed:", error.message);
      return 0;
    }
    return computeSurgeFromCount(count ?? 0);
  } catch (e) {
    console.warn("[userSurge] count fallback threw:", (e as Error).message);
    return 0;
  }
}

export interface SurgeValidation {
  ok: boolean;
  expectedSurge: number;
  clientSurge: number;
  reason?: string;
}

/**
 * Validate that a booking payload's price reflects the server-computed surge.
 *
 * Rules:
 *  - Client MUST send `loyalty_surge_amount` in booking_data when expectedSurge > 0.
 *  - If `base_price_inr` is present, `price_inr` must equal `base + expectedSurge` (±1).
 *  - Otherwise, `loyalty_surge_amount` itself must equal `expectedSurge` (±1).
 *
 * Tolerance of ₹1 accommodates rounding.
 */
export function validateBookingSurge(
  bookingData: Record<string, unknown>,
  expectedSurge: number,
): SurgeValidation {
  const clientSurge = Number(
    (bookingData.loyalty_surge_amount as number | undefined) ??
      (bookingData.surge_amount as number | undefined) ??
      0,
  );
  const priceInr = Number(bookingData.price_inr ?? 0);
  const basePrice = Number(
    (bookingData.base_price_inr as number | undefined) ??
      (priceInr - clientSurge),
  );

  if (expectedSurge === 0) {
    // No surge owed — accept whatever; nothing to enforce.
    return { ok: true, expectedSurge, clientSurge };
  }

  if (Math.abs(clientSurge - expectedSurge) > 1) {
    return {
      ok: false,
      expectedSurge,
      clientSurge,
      reason: `Loyalty surge mismatch: client sent ₹${clientSurge}, server expected ₹${expectedSurge}`,
    };
  }

  if (basePrice > 0 && Math.abs(priceInr - (basePrice + expectedSurge)) > 1) {
    return {
      ok: false,
      expectedSurge,
      clientSurge,
      reason: `Price mismatch: ₹${priceInr} != base ₹${basePrice} + surge ₹${expectedSurge}`,
    };
  }

  return { ok: true, expectedSurge, clientSurge };
}
