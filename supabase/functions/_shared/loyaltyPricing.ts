/**
 * Server-side mirror of src/features/booking/loyalty.ts
 *
 * Keep in sync with the client version. Used by edge functions to
 * recompute the authoritative final price from profiles.completed_bookings_count.
 */

export interface LoyaltyAdjustment {
  count: number;
  loyaltyCharge: number;
  firstBookingDiscount: number;
  netAdjustment: number;
}

const FIRST_BOOKING_DISCOUNT = 10;

export function computeLoyaltyAdjustment(rawCount: number | null | undefined): LoyaltyAdjustment {
  const count = Math.max(0, Math.floor(Number(rawCount ?? 0)));
  let loyaltyCharge = 0;
  if (count >= 10) loyaltyCharge = 30;
  else if (count >= 6) loyaltyCharge = 20;
  else if (count >= 3) loyaltyCharge = 10;
  const firstBookingDiscount = count === 0 ? FIRST_BOOKING_DISCOUNT : 0;
  return {
    count,
    loyaltyCharge,
    firstBookingDiscount,
    netAdjustment: loyaltyCharge - firstBookingDiscount,
  };
}

export function applyLoyaltyToBase(basePrice: number, rawCount: number | null | undefined): {
  basePrice: number;
  finalPrice: number;
  adjustment: LoyaltyAdjustment;
} {
  const safeBase = Math.max(0, Math.round(Number(basePrice) || 0));
  const adjustment = computeLoyaltyAdjustment(rawCount);
  return {
    basePrice: safeBase,
    finalPrice: Math.max(0, safeBase + adjustment.netAdjustment),
    adjustment,
  };
}
