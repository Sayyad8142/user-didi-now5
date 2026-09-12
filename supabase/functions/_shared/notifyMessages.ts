// ============================================================================
// Customer-facing notification copy helpers.
// ----------------------------------------------------------------------------
// The push bodies must NEVER contain "undefined", "null", raw enum values or
// internal identifiers. Every helper here resolves a safe, customer-facing
// label or falls back to generic wording.
// ============================================================================

/** Known service_type → customer-facing service name. */
const SERVICE_LABELS: Record<string, string> = {
  maid: "Maid Service",
  maid_service: "Maid Service",
  bathroom: "Bathroom Cleaning",
  bathroom_cleaning: "Bathroom Cleaning",
  kitchen: "Kitchen Cleaning",
  kitchen_cleaning: "Kitchen Cleaning",
  cook: "Cooking Service",
  cooking: "Cooking Service",
};

/**
 * Resolve a customer-facing service name, or null when it cannot be resolved
 * safely (missing / null / empty / not a plain snake_case service key).
 */
export function serviceLabel(raw: unknown): string | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || key === "undefined" || key === "null") return null;
  if (SERVICE_LABELS[key]) return SERVICE_LABELS[key];
  // Safe presentation of an unmapped but clearly non-technical service key.
  if (!/^[a-z][a-z_]{1,40}$/.test(key)) return null;
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Resolve a customer-facing worker name, or null if unusable. */
export function workerLabel(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  if (!name || /^(undefined|null)$/i.test(name)) return null;
  // Never leak UUID-ish internal values.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name)) return null;
  return name;
}

export function bookingCreatedBody(serviceType: unknown): string {
  const label = serviceLabel(serviceType);
  return label
    ? `Your ${label} booking has been created successfully.`
    : "Your booking has been created successfully.";
}

export function serviceStartedBody(serviceType: unknown): string {
  const label = serviceLabel(serviceType);
  return label ? `Your ${label} service has started.` : "Your service has started.";
}

export function bookingCompletedBody(serviceType: unknown): string {
  const label = serviceLabel(serviceType);
  return label
    ? `Your ${label} service has been completed successfully.`
    : "Your service has been completed successfully.";
}

export function workerAssignedBody(workerName: unknown): string {
  const name = workerLabel(workerName);
  return name
    ? `${name} has been assigned to your booking.`
    : "A Didi has been assigned to your booking.";
}

/**
 * Cancellation copy. Only claims a wallet refund when the refund actually
 * succeeded (a positive credited amount).
 */
export function bookingCancelledBody(refundedAmount: number | null | undefined): string {
  const amt = Number(refundedAmount ?? 0);
  return Number.isFinite(amt) && amt > 0
    ? "Your booking has been cancelled. The amount has been refunded to your wallet."
    : "Your booking has been cancelled.";
}

export function refundCompletedBody(amount: unknown): string | null {
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt) || amt <= 0) return null;
  const pretty = Number.isInteger(amt) ? String(amt) : amt.toFixed(2);
  return `₹${pretty} has been refunded to your Didi Now wallet.`;
}
