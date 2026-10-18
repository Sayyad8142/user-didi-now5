// Pure payout math for completion. No hardcoded rate: the caller must pass the
// community's configured commission. Missing/invalid config fails closed.
export class CommissionConfigError extends Error {
  constructor(public code: "COMMISSION_MISSING" | "COMMISSION_INVALID" | "AMOUNT_INVALID") {
    super(code);
  }
}

export interface PayoutSplit {
  gross: number; // INR, 2 decimals
  platform_fee: number; // INR, 2 decimals
  net: number; // INR, 2 decimals
  commission_percent: number;
}

/** Splits a booking amount. Works in paise; fee rounded half-up to the nearest paisa; net = gross - fee. */
export function computePayout(grossInr: unknown, commissionPercent: unknown): PayoutSplit {
  if (commissionPercent === null || commissionPercent === undefined || commissionPercent === "") {
    throw new CommissionConfigError("COMMISSION_MISSING");
  }
  const pct = Number(commissionPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new CommissionConfigError("COMMISSION_INVALID");
  const gross = Number(grossInr);
  if (!Number.isFinite(gross) || gross < 0) throw new CommissionConfigError("AMOUNT_INVALID");

  const grossPaise = Math.round(gross * 100);
  const feePaise = Math.round((grossPaise * pct) / 100);
  return {
    gross: grossPaise / 100,
    platform_fee: feePaise / 100,
    net: (grossPaise - feePaise) / 100,
    commission_percent: pct,
  };
}
