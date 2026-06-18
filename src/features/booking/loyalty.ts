/**
 * Didi Now — Loyalty Pricing V1
 *
 * Single source of truth for tier math. Used by both the client
 * (breakdown UI) and server (price enforcement helper mirrors this).
 *
 * Rules:
 *   - count = profiles.completed_bookings_count
 *   - count === 0      → first-booking discount of ₹10 (no loyalty charge)
 *   - count 1..2       → no charge, no discount
 *   - count 3..5       → +₹10 loyalty charge
 *   - count 6..9       → +₹20 loyalty charge
 *   - count 10+        → +₹30 loyalty charge
 */

export type LoyaltyTier = 'new' | 'regular' | 'silver' | 'gold';

export interface LoyaltyInfo {
  count: number;
  tier: LoyaltyTier;
  tierLabel: string;
  /** Extra ₹ added to base price (0 for new customers). */
  loyaltyCharge: number;
  /** ₹ discount applied (only on the very first booking). */
  firstBookingDiscount: number;
  /** loyaltyCharge - firstBookingDiscount. */
  netAdjustment: number;
  /** Next tier completed-bookings threshold, or null if at top. */
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /** What the loyalty charge will become at the next tier. */
  nextTierCharge: number | null;
  /** Bookings remaining until next tier. */
  bookingsToNextTier: number | null;
}

const FIRST_BOOKING_DISCOUNT = 10;

export function getLoyaltyInfo(rawCount: number | null | undefined): LoyaltyInfo {
  const count = Math.max(0, Math.floor(Number(rawCount ?? 0)));

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
    tier = 'new'; tierLabel = count === 0 ? 'New Customer' : 'New Customer';
    loyaltyCharge = 0;
    nextTierAt = 3; nextTierLabel = 'Regular Customer'; nextTierCharge = 10;
  }

  const firstBookingDiscount = count === 0 ? FIRST_BOOKING_DISCOUNT : 0;
  const netAdjustment = loyaltyCharge - firstBookingDiscount;
  const bookingsToNextTier = nextTierAt != null ? Math.max(0, nextTierAt - count) : null;

  return {
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
