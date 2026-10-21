import { describe, expect, test } from 'bun:test';
import {
  friendlyBookingError, redactForLog, maskPhone,
  NETWORK_ERROR_MESSAGE, GENERIC_BOOKING_ERROR_MESSAGE, PAYMENT_UNCERTAIN_MESSAGE,
  SLOT_UNAVAILABLE_MESSAGE, AUTH_EXPIRED_MESSAGE,
} from '../src/lib/customerErrors';

describe('friendlyBookingError', () => {
  test('database error text is never shown', () => {
    const msg = friendlyBookingError({ message: 'new row violates check constraint "bookings_flat_size_chk"' });
    expect(msg).toBe(GENERIC_BOOKING_ERROR_MESSAGE);
    expect(msg).not.toContain('constraint');
  });
  test('network failures', () => {
    expect(friendlyBookingError(new Error('Load failed'))).toBe(NETWORK_ERROR_MESSAGE);
    expect(friendlyBookingError(new Error('Failed to fetch'))).toBe(NETWORK_ERROR_MESSAGE);
  });
  test('payment failures never invite blind retry', () => {
    expect(friendlyBookingError(new Error('Razorpay order failed: 500'))).toBe(PAYMENT_UNCERTAIN_MESSAGE);
  });
  test('slot and auth', () => {
    expect(friendlyBookingError({ message: 'Slot unavailable' })).toBe(SLOT_UNAVAILABLE_MESSAGE);
    expect(friendlyBookingError({ message: 'Authentication expired, please login again' })).toBe(AUTH_EXPIRED_MESSAGE);
  });
  test('empty error', () => {
    expect(friendlyBookingError(undefined)).toBe(GENERIC_BOOKING_ERROR_MESSAGE);
  });
});

describe('redactForLog', () => {
  test('removes name, phone, flat number and OTP but keeps diagnostics', () => {
    const out = redactForLog({
      cust_name: 'Asha', cust_phone: '+919876543210', flat_no: 'A-101', otp: '123',
      service_type: 'maid', price_inr: 199, booking_type: 'instant',
    });
    expect(out.cust_name).toBe('[redacted]');
    expect(out.cust_phone).toBe('[redacted]');
    expect(out.flat_no).toBe('[redacted]');
    expect(out.otp).toBe('[redacted]');
    expect(out.price_inr).toBe(199);
    expect(out.service_type).toBe('maid');
  });
  test('does not mutate the original booking payload', () => {
    const payload = { cust_phone: '+919876543210' };
    redactForLog(payload);
    expect(payload.cust_phone).toBe('+919876543210');
  });
  test('maskPhone keeps only last 4 digits', () => {
    expect(maskPhone('+919876543210')).toBe('******3210');
  });
});
