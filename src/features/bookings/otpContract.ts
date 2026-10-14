export interface OtpBookingState {
  id: string;
  status: string;
  worker_id?: string | null;
  worker_name?: string | null;
  assigned_at?: string | null;
  completion_otp?: string | null;
  otp_verified_at?: string | null;
  completed_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  otp_mode?: 'legacy' | 'v2';
  assignment_generation?: number;
}

export type OtpResponse =
  | { otp_mode: 'v2'; available: true; otp_type: 'start' | 'completion'; otp: string; assignment_generation: number }
  | { otp_mode: 'v2'; available: false; reason: 'CREDENTIALS_NOT_READY' | 'NOT_AVAILABLE_FOR_CURRENT_STATE' }
  | { otp_mode: 'legacy'; available: false; reason: 'LEGACY_BOOKING' }
  | { available: false; error_code: string };

export interface VisibleOtp {
  mode: 'legacy' | 'v2';
  type: 'start' | 'completion';
  otp: string;
  generation?: number;
}

export const OTP_ACTIVE_STATUSES = ['assigned', 'accepted', 'confirmed', 'on_the_way', 'reached', 'started', 'in_progress'];
export function otpStateKey(b: OtpBookingState): string {
  return JSON.stringify([b.id, b.status, b.worker_id, b.worker_name, b.assigned_at, b.assignment_generation, b.otp_mode, b.otp_verified_at, b.completed_at, b.payment_status, b.payment_method, b.completion_otp]);
}

export function canShowBookingOtp(b: OtpBookingState): boolean {
  return OTP_ACTIVE_STATUSES.includes(b.status) && !b.completed_at;
}

export function resolveVisibleOtp(b: OtpBookingState, response: OtpResponse | null, gatewayEnabled: boolean): VisibleOtp | null {
  if (!canShowBookingOtp(b)) return null;
  if (response && 'otp_mode' in response && response.otp_mode === 'v2') {
    if (!response.available) return null;
    if (b.assignment_generation !== undefined && b.assignment_generation !== response.assignment_generation) return null;
    // Stage authority comes from the gateway, not an inferred timestamp or local credential.
    const started = ['started', 'in_progress'].includes(b.status);
    if (response.otp_type === 'completion' && !started) return null;
    if (response.otp_type === 'start' && started) return null;
    return { mode: 'v2', type: response.otp_type, otp: response.otp, generation: response.assignment_generation };
  }
  if (b.otp_mode === 'v2') return null;
  // With the gateway enabled, only an explicit LEGACY_BOOKING response permits fallback.
  if (gatewayEnabled && !(response && 'otp_mode' in response && response.otp_mode === 'legacy')) return null;
  const paidLike = b.payment_status === 'paid' || b.payment_status === 'pay_after_service' ||
    b.payment_method === 'pay_after_service' || ['wallet', 'wallet+razorpay', 'razorpay'].includes(b.payment_method ?? '');
  if (!paidLike || b.otp_verified_at || !b.completion_otp) return null;
  return { mode: 'legacy', type: 'completion', otp: String(b.completion_otp) };
}

export function parseOtpResponse(value: unknown): OtpResponse {
  if (!value || typeof value !== 'object') throw new Error('INVALID_GATEWAY_RESPONSE');
  const v = value as Record<string, unknown>;
  if (v.otp_mode === 'v2' && v.available === true &&
    (v.otp_type === 'start' || v.otp_type === 'completion') &&
    typeof v.otp === 'string' && /^\d{4}$/.test(v.otp) &&
    Number.isSafeInteger(v.assignment_generation) && Number(v.assignment_generation) >= 0) {
    return { otp_mode: 'v2', available: true, otp_type: v.otp_type, otp: v.otp, assignment_generation: Number(v.assignment_generation) };
  }
  if (v.otp_mode === 'v2' && v.available === false && (v.reason === 'CREDENTIALS_NOT_READY' || v.reason === 'NOT_AVAILABLE_FOR_CURRENT_STATE')) {
    return { otp_mode: 'v2', available: false, reason: v.reason };
  }
  if (v.otp_mode === 'legacy' && v.available === false && v.reason === 'LEGACY_BOOKING') return { otp_mode: 'legacy', available: false, reason: 'LEGACY_BOOKING' };
  if (v.available === false && typeof v.error_code === 'string') return { available: false, error_code: 'BOOKING_NOT_FOUND' };
  throw new Error('INVALID_GATEWAY_RESPONSE');
}

/** Remove all V2 credentials from generic booking reads/caches; gateway is the only credential source. */
export function sanitizeOtpBooking<T extends Record<string, unknown>>(row: T): T {
  const clean = { ...row };
  delete clean.start_otp;
  delete clean.otp;
  if (row.otp_mode === 'v2') delete clean.completion_otp;
  return clean;
}