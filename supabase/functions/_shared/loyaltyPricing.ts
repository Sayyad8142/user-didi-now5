/**
 * Server-side mirror of src/features/booking/loyalty.ts
 *
 * SAFETY (V1.1): If `rawCount` is null/undefined/NaN — i.e. the caller
 * could not successfully read profiles.completed_bookings_count — we
 * MUST NOT apply any loyalty adjustment. Returns adjustment={0,0,0}
 * and `available=false` so callers can log `loyalty_pricing_skipped`.
 */

export interface LoyaltyAdjustment {
  available: boolean;
  count: number;
  loyaltyCharge: number;
  firstBookingDiscount: number;
  netAdjustment: number;
}

const FIRST_BOOKING_DISCOUNT = 10;

export function computeLoyaltyAdjustment(rawCount: number | null | undefined): LoyaltyAdjustment {
  if (rawCount === null || rawCount === undefined || Number.isNaN(Number(rawCount))) {
    return {
      available: false,
      count: 0,
      loyaltyCharge: 0,
      firstBookingDiscount: 0,
      netAdjustment: 0,
    };
  }
  const count = Math.max(0, Math.floor(Number(rawCount)));
  let loyaltyCharge = 0;
  if (count >= 10) loyaltyCharge = 30;
  else if (count >= 6) loyaltyCharge = 20;
  else if (count >= 3) loyaltyCharge = 10;
  const firstBookingDiscount = count === 0 ? FIRST_BOOKING_DISCOUNT : 0;
  return {
    available: true,
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
