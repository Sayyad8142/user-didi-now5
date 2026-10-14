import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOtpResponse, resolveVisibleOtp, sanitizeOtpBooking, type OtpBookingState } from '../src/features/bookings/otpContract';
import { OtpLifecycle } from '../src/features/bookings/otpLifecycle';
import { retrieveBookingOtp, type OtpGatewayDependencies } from '../src/features/bookings/otpGatewayTransport';
import { safeNotificationText } from '../src/lib/otpNotificationSafety';

const id = '11111111-2222-4333-8444-555555555555';
const booking: OtpBookingState = { id, status: 'assigned', worker_id: 'worker-a', payment_status: 'paid', completion_otp: '123' };
const start = parseOtpResponse({ otp_mode: 'v2', available: true, otp_type: 'start', otp: '0123', assignment_generation: 2 });
const completion = parseOtpResponse({ otp_mode: 'v2', available: true, otp_type: 'completion', otp: '0567', assignment_generation: 2 });
const legacy = parseOtpResponse({ otp_mode: 'legacy', available: false, reason: 'LEGACY_BOOKING' });

describe('Customer OTP rules', () => {
  it('preserves four-digit leading zeroes', () => assert.equal(resolveVisibleOtp(booking, start, true)?.otp, '0123'));
  it('rejects numeric gateway credentials', () => assert.throws(() => parseOtpResponse({ otp_mode: 'v2', available: true, otp_type: 'start', otp: 1234, assignment_generation: 2 })));
  it('shows Start only before service starts', () => {
    assert.equal(resolveVisibleOtp(booking, start, true)?.type, 'start');
    assert.equal(resolveVisibleOtp({ ...booking, status: 'started' }, start, true), null);
  });
  it('prevents early Completion exposure', () => assert.equal(resolveVisibleOtp(booking, completion, true), null));
  it('shows separate Completion after Start verification and started state', () => assert.equal(resolveVisibleOtp({ ...booking, status: 'started' }, completion, true)?.otp, '0567'));
  for (const status of ['pending', 'cancelled', 'completed']) {
    it(`hides both codes for ${status}`, () => {
      assert.equal(resolveVisibleOtp({ ...booking, status }, start, true), null);
      assert.equal(resolveVisibleOtp({ ...booking, status }, completion, true), null);
      assert.equal(resolveVisibleOtp({ ...booking, status }, legacy, true), null);
    });
  }
  it('never falls back for V2 unavailable responses', () => {
    for (const reason of ['CREDENTIALS_NOT_READY', 'NOT_AVAILABLE_FOR_CURRENT_STATE']) {
      assert.equal(resolveVisibleOtp(booking, parseOtpResponse({ otp_mode: 'v2', available: false, reason }), true), null);
    }
  });
  it('never falls back for explicit V2 even when transport is off', () => assert.equal(resolveVisibleOtp({ ...booking, otp_mode: 'v2' }, null, false), null));
  it('preserves legacy payment/verification gates', () => {
    assert.equal(resolveVisibleOtp(booking, null, false)?.otp, '123');
    assert.equal(resolveVisibleOtp({ ...booking, payment_status: 'pending' }, legacy, true), null);
    assert.equal(resolveVisibleOtp({ ...booking, otp_verified_at: 'verified' }, legacy, true), null);
    assert.equal(resolveVisibleOtp({ ...booking, payment_status: 'pending', payment_method: 'pay_after_service' }, legacy, true)?.otp, '123');
  });
  it('fails closed on gateway error/missing response', () => {
    assert.equal(resolveVisibleOtp(booking, null, true), null);
    assert.equal(resolveVisibleOtp(booking, { available: false, error_code: 'BOOKING_NOT_FOUND' }, true), null);
  });
  it('rejects mismatched assignment generation', () => assert.equal(resolveVisibleOtp({ ...booking, assignment_generation: 3 }, start, true), null));
  it('clears pending results on background/logout/cancel invalidation', () => {
    const session = new OtpLifecycle();
    const epoch = session.begin(booking);
    session.clear();
    assert.equal(session.accept(epoch, booking, start, true), null);
  });
  it('discards old worker results after reassignment', () => {
    const session = new OtpLifecycle();
    const old = session.begin(booking);
    session.begin({ ...booking, worker_id: 'worker-b' });
    assert.equal(session.accept(old, booking, start, true), null);
  });
  it('rejects generation rollback and remembers V2 across errors', () => {
    const session = new OtpLifecycle();
    assert.equal(session.accept(session.begin(booking), booking, start, true)?.generation, 2);
    assert.equal(session.accept(session.begin(booking), booking, parseOtpResponse({ otp_mode: 'v2', available: true, otp_type: 'start', otp: '9876', assignment_generation: 1 }), true), null);
    assert.equal(session.accept(session.begin(booking), booking, legacy, true), null);
  });
  it('strips V2 credentials from booking caches', () => {
    assert.deepEqual(sanitizeOtpBooking({ otp_mode: 'v2', completion_otp: '0567', start_otp: '0123', otp: '0123', id }), { otp_mode: 'v2', id });
    assert.equal(sanitizeOtpBooking({ completion_otp: '123' }).completion_otp, '123');
  });
  it('redacts OTP codes in notification text without hiding unrelated amounts', () => {
    assert.equal(safeNotificationText('Worker assigned | OTP: 0123'), 'Worker assigned | OTP: [hidden]');
    assert.equal(safeNotificationText('Paid ₹1234'), 'Paid ₹1234');
  });
});

function dependencies(responses: Response[]) {
  const requests: RequestInit[] = [];
  const refreshes: boolean[] = [];
  const pauses: number[] = [];
  const deps: OtpGatewayDependencies = {
    enabled: true, endpoint: 'https://isolated.invalid/otp-v2-gateway', apikey: 'test-public',
    getToken: async force => { refreshes.push(force); return 'mock-id-token'; },
    fetch: (async (_url, init) => { requests.push(init ?? {}); const response = responses.shift(); if (!response) throw new Error('Unexpected request'); return response; }) as typeof fetch,
    pause: async ms => { pauses.push(ms); },
  };
  return { deps, requests, refreshes, pauses };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('Isolated gateway transport', () => {
  it('makes zero token/network calls while disabled', async () => {
    const d = dependencies([]); d.deps.enabled = false;
    assert.equal(await retrieveBookingOtp(id, d.deps), null);
    assert.equal(d.requests.length, 0); assert.equal(d.refreshes.length, 0);
  });
  it('uses retrieve body and Firebase header without customer session', async () => {
    const d = dependencies([json(start)]);
    assert.deepEqual(await retrieveBookingOtp(id, d.deps), start);
    assert.deepEqual(JSON.parse(String(d.requests[0]?.body)), { action: 'retrieve', booking_id: id });
    assert.deepEqual(d.requests[0]?.headers, { 'Content-Type': 'application/json', apikey: 'test-public', 'x-firebase-token': 'mock-id-token' });
  });
  for (const status of [401, 403]) {
    it(`force-refreshes once on ${status}`, async () => {
      const d = dependencies([json({}, status), json(start)]);
      assert.deepEqual(await retrieveBookingOtp(id, d.deps), start);
      assert.deepEqual(d.refreshes, [false, true]); assert.equal(d.requests.length, 2);
    });
  }
  it('stops repeated auth failures without exposing body', async () => {
    const d = dependencies([json({}, 401), json({ otp: '0123' }, 401)]);
    await assert.rejects(retrieveBookingOtp(id, d.deps), /OTP_GATEWAY_HTTP_401/);
    assert.equal(d.requests.length, 2);
  });
  it('bounds credentials-not-ready retries to three reads', async () => {
    const pending = { otp_mode: 'v2', available: false, reason: 'CREDENTIALS_NOT_READY' };
    const d = dependencies([json(pending), json(pending), json(pending)]);
    assert.deepEqual(await retrieveBookingOtp(id, d.deps), pending);
    assert.equal(d.requests.length, 3); assert.deepEqual(d.pauses, [750, 1500]);
  });
  for (const status of [400, 405, 503]) {
    it(`fails closed on HTTP ${status}`, async () => {
      const d = dependencies([json({ otp: '0123' }, status)]);
      await assert.rejects(retrieveBookingOtp(id, d.deps), new RegExp(`OTP_GATEWAY_HTTP_${status}`));
      assert.equal(d.requests.length, 1);
    });
  }
});