/**
 * Per-user loyalty/demand surge pricing.
 *
 * Tier is based on the user's total non-cancelled bookings.
 * The booking currently being placed is the (count + 1)th.
 *
 *   Bookings #1–3    → +₹0   (base)
 *   Bookings #4–6    → +₹10
 *   Bookings #7–10   → +₹30
 *   Bookings #11–14  → +₹60
 *   Bookings #15+    → +₹30 more per tier of 4   (15–18=+90, 19–22=+120, …)
 *
 * Pure function — safe to use in both client and edge functions.
 */

/**
 * Dynamic Pricing launch date — only bookings COMPLETED on or after this
 * date count toward the user's loyalty tier.
 */
export const LOYALTY_SURGE_LAUNCH_DATE = '2026-07-01';

export interface SurgeResult {
  /** Extra ₹ to add to base price */
  amount: number;
  /** 1-indexed booking number this surge applies to */
  bookingNumber: number;
  /** Human-friendly tier label */
  tierLabel: string;
  /** Next booking number where surge changes (null if at max) */
  nextThreshold: number | null;
  /** What the surge will become at nextThreshold */
  nextAmount: number | null;
}

export function computeUserSurge(completedCount: number): SurgeResult {
  const bookingNumber = Math.max(0, completedCount) + 1;

  if (bookingNumber <= 3) {
    return {
      amount: 0,
      bookingNumber,
      tierLabel: 'Base price',
      nextThreshold: 4,
      nextAmount: 10,
    };
  }
  if (bookingNumber <= 6) {
    return {
      amount: 10,
      bookingNumber,
      tierLabel: 'Loyalty tier 2',
      nextThreshold: 7,
      nextAmount: 30,
    };
  }
  if (bookingNumber <= 10) {
    return {
      amount: 30,
      bookingNumber,
      tierLabel: 'Loyalty tier 3',
      nextThreshold: 11,
      nextAmount: 60,
    };
  }
  // Tier 4 and beyond: +₹30 per group of 4 above 10
  // 11–14 → 60, 15–18 → 90, 19–22 → 120, ...
  const tiersAbove10 = Math.floor((bookingNumber - 11) / 4) + 1; // 1, 2, 3...
  const amount = 30 + tiersAbove10 * 30;
  const nextThreshold = 11 + tiersAbove10 * 4;
  return {
    amount,
    bookingNumber,
    tierLabel: `Loyalty tier ${3 + tiersAbove10}`,
    nextThreshold,
    nextAmount: amount + 30,
  };
}
