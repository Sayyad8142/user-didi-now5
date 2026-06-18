/**
 * Didi Now — Loyalty Pricing V1
 *
 * Single source of truth for tier math. Used by both the client
 * (breakdown UI) and server (price enforcement helper mirrors this).
 *
 * SAFETY (V1.1):
 *   The loyalty system is OPT-IN per request. If the caller cannot
 *   *successfully* read `profiles.completed_bookings_count` from the
 *   database, we MUST fall back to normal base pricing — no discount,
 *   no surcharge. The only way to receive the ₹10 first-booking
 *   discount is to pass a numeric `count` (including 0) that was
 *   actually retrieved from the DB.
 *
 * Pass `count = null` (or undefined) to explicitly disable loyalty.
 *
 * Tier rules (when count is known):
 *   - count === 0      → first-booking discount of ₹10 (no loyalty charge)
 *   - count 1..2       → no charge, no discount
 *   - count 3..5       → +₹10 loyalty charge
 *   - count 6..9       → +₹20 loyalty charge
 *   - count 10+        → +₹30 loyalty charge
 */

export type LoyaltyTier = 'unknown' | 'new' | 'regular' | 'silver' | 'gold';

export interface LoyaltyInfo {
  /** Whether the count was successfully retrieved from the DB. */
  available: boolean;
  count: number;
  tier: LoyaltyTier;
  tierLabel: string;
  /** Extra ₹ added to base price (0 for new customers / unknown). */
  loyaltyCharge: number;
  /** ₹ discount applied (only on the very first booking). */
  firstBookingDiscount: number;
  /** loyaltyCharge - firstBookingDiscount. */
  netAdjustment: number;
  /** Next tier completed-bookings threshold, or null if at top / unknown. */
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /** What the loyalty charge will become at the next tier. */
  nextTierCharge: number | null;
  /** Bookings remaining until next tier. */
  bookingsToNextTier: number | null;
}

const FIRST_BOOKING_DISCOUNT = 10;

/**
 * Build a LoyaltyInfo from a *successfully retrieved* count.
 * Pass `null`/`undefined` when the DB value is missing, NULL, or the
 * lookup failed — in that case loyalty is fully disabled (no
 * adjustment, no banner).
 */
export function getLoyaltyInfo(rawCount: number | null | undefined): LoyaltyInfo {
  // Unknown → loyalty disabled (safety fallback).
  if (rawCount === null || rawCount === undefined || Number.isNaN(Number(rawCount))) {
    return {
      available: false,
      count: 0,
      tier: 'unknown',
      tierLabel: 'Customer',
      loyaltyCharge: 0,
      firstBookingDiscount: 0,
      netAdjustment: 0,
      nextTierAt: null,
      nextTierLabel: null,
      nextTierCharge: null,
      bookingsToNextTier: null,
    };
  }

  const count = Math.max(0, Math.floor(Number(rawCount)));

  let tier: LoyaltyTier;
  let tierLabel: string;
  let loyaltyCharge: number;
  let nextTierAt: number | null;
  let nextTierLabel: string | null;
  let nextTierCharge: number | null;

  if (count >= 10) {
    tier = 'gold'; tierLabel = 'Gold Customer';
    loyaltyCharge = 30;
    nextTierAt = null; nextTierLabel = null; nextTierCharge = null;
  } else if (count >= 6) {
    tier = 'silver'; tierLabel = 'Silver Customer';
    loyaltyCharge = 20;
    nextTierAt = 10; nextTierLabel = 'Gold Customer'; nextTierCharge = 30;
  } else if (count >= 3) {
    tier = 'regular'; tierLabel = 'Regular Customer';
    loyaltyCharge = 10;
    nextTierAt = 6; nextTierLabel = 'Silver Customer'; nextTierCharge = 20;
  } else {
    tier = 'new'; tierLabel = 'New Customer';
    loyaltyCharge = 0;
    nextTierAt = 3; nextTierLabel = 'Regular Customer'; nextTierCharge = 10;
  }

  const firstBookingDiscount = count === 0 ? FIRST_BOOKING_DISCOUNT : 0;
  const netAdjustment = loyaltyCharge - firstBookingDiscount;
  const bookingsToNextTier = nextTierAt != null ? Math.max(0, nextTierAt - count) : null;

  return {
    available: true,
    count,
    tier,
    tierLabel,
    loyaltyCharge,
    firstBookingDiscount,
    netAdjustment,
    nextTierAt,
    nextTierLabel,
    nextTierCharge,
    bookingsToNextTier,
  };
}

/** Apply loyalty adjustment on top of any base price (e.g. price + surge). */
export function applyLoyalty(basePrice: number, rawCount: number | null | undefined): {
  basePrice: number;
  finalPrice: number;
  info: LoyaltyInfo;
} {
  const safeBase = Math.max(0, Math.round(Number(basePrice) || 0));
  const info = getLoyaltyInfo(rawCount);
  const finalPrice = Math.max(0, safeBase + info.netAdjustment);
  return { basePrice: safeBase, finalPrice, info };
}
