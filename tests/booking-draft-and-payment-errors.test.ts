import { describe, expect, test, mock } from 'bun:test';

mock.module('@/integrations/supabase/client', () => ({ supabase: {}, initSupabase: async () => true }));

import { saveBookingDraft, takeBookingDraft, DRAFT_TTL_MS } from '../src/lib/bookingDraft';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('booking draft (flat details round-trip)', () => {
  test('restores tasks, dish workload, bathrooms, glass partition, date and time', () => {
    const s = memStore();
    saveBookingDraft('form:maid', { selectedTasks: ['dish_washing', 'floor_cleaning'], dishIntensity: 'heavy', bathroomCount: 2, hasGlassPartition: true }, s, 1000);
    expect(takeBookingDraft('form:maid', s, 2000)).toEqual({ selectedTasks: ['dish_washing', 'floor_cleaning'], dishIntensity: 'heavy', bathroomCount: 2, hasGlassPartition: true });
    saveBookingDraft('schedule:maid', { selectedDate: '2026-10-23T00:00:00.000Z', selectedTime: '09:30' }, s, 1000);
    expect(takeBookingDraft('schedule:maid', s, 2000)).toEqual({ selectedDate: '2026-10-23T00:00:00.000Z', selectedTime: '09:30' });
  });
  test('never stores price, payment or token fields', () => {
    const s = memStore();
    saveBookingDraft('form:maid', { selectedTasks: [], price_inr: 199, razorpay_order_id: 'order_x', token: 'abc', paymentMethod: 'wallet' }, s, 0);
    const raw = [...s.m.values()][0];
    expect(raw).not.toContain('199');
    expect(raw).not.toContain('order_x');
    expect(raw).not.toContain('abc');
    expect(raw).not.toContain('wallet');
  });
  test('read once, so it cannot restore twice', () => {
    const s = memStore();
    saveBookingDraft('form:maid', { bathroomCount: 3 }, s, 0);
    expect(takeBookingDraft('form:maid', s, 1)).toEqual({ bathroomCount: 3 });
    expect(takeBookingDraft('form:maid', s, 2)).toBeNull();
  });
  test('expires after 30 minutes', () => {
    const s = memStore();
    saveBookingDraft('form:maid', { bathroomCount: 3 }, s, 0);
    expect(takeBookingDraft('form:maid', s, DRAFT_TTL_MS + 1)).toBeNull();
  });
  test('corrupt data is ignored', () => {
    const s = memStore();
    s.setItem('booking_draft:form:maid', '{not json');
    expect(takeBookingDraft('form:maid', s, 0)).toBeNull();
  });
});

describe('payment retry screen wording', async () => {
  const { toUserFriendlyPaymentError, PAYMENT_STATUS_UNCERTAIN_MESSAGE } = await import('../src/lib/paymentService');
  test('raw server text is never shown', () => {
    expect(toUserFriendlyPaymentError({ message: 'duplicate key value violates unique constraint' })).toBe(PAYMENT_STATUS_UNCERTAIN_MESSAGE);
    expect(toUserFriendlyPaymentError({ message: 'Edge Function returned a non-2xx status code' })).toBe(PAYMENT_STATUS_UNCERTAIN_MESSAGE);
  });
  test('never claims a refund is completed', () => {
    for (const m of ['BOOKING_INSERT_FAILED: x', 'Payment verification failed', 'booking could not be created']) {
      expect(toUserFriendlyPaymentError({ message: m })).not.toMatch(/has been refunded|Amount has been refunded/i);
    }
  });
  test('verification failure asks to check My Bookings first', () => {
    expect(toUserFriendlyPaymentError({ message: 'Payment verification failed' })).toContain('check My Bookings');
  });
  test('network and session', () => {
    expect(toUserFriendlyPaymentError({ message: 'Failed to fetch' })).toContain('check My Bookings');
    expect(toUserFriendlyPaymentError({ message: 'Authentication expired' })).toBe('Session expired. Please login again.');
  });
});
