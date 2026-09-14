/**
 * Price-quote failure handling.
 *
 * The backend is the authority for the payable amount. When it rejects a quote
 * (loyalty surge, slot surge or price composition mismatch) the customer must
 * see the NEW total and confirm it again — never a generic "Payment failed".
 */

export const PRICE_QUOTE_ERROR_CODES = [
  'PRICE_MISMATCH',
  'SLOT_SURGE_MISMATCH',
  'PRICE_COMPOSITION_MISMATCH',
  'AMOUNT_MISMATCH',
] as const;

export type PriceQuoteErrorCode = typeof PRICE_QUOTE_ERROR_CODES[number];

export interface BackendErrorDetails {
  code?: string;
  expected_surge?: number;
  received_surge?: number;
  expected_price?: number;
  received_price?: number;
}

/** Error thrown by paymentService with the backend's structured body attached. */
export function getBackendErrorDetails(err: unknown): BackendErrorDetails | null {
  const details = (err as any)?.backend;
  return details && typeof details === 'object' ? details : null;
}

export function isPriceQuoteError(err: unknown): boolean {
  const code = getBackendErrorDetails(err)?.code;
  return !!code && (PRICE_QUOTE_ERROR_CODES as readonly string[]).includes(code);
}

/** Customer-facing copy for a stale quote, including the corrected total when known. */
export function priceQuoteMessage(err: unknown, clientTotal: number | null): string {
  const d = getBackendErrorDetails(err);
  if (d?.expected_price != null) {
    return `The price for this slot is now ₹${Math.round(d.expected_price)}. We've updated it — please confirm to pay.`;
  }
  if (d?.expected_surge != null && d?.received_surge != null && clientTotal != null) {
    const corrected = Math.round(clientTotal + (d.expected_surge - d.received_surge));
    return `The price is now ₹${corrected}. We've updated it — please confirm to pay.`;
  }
  return "The price was updated. We've refreshed it — please confirm to pay.";
}
