import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
  checkBookingAllowed,
  bookingPauseMessageFromError,
  BOOKINGS_PAUSED_FALLBACK_MESSAGE,
  SCHEDULED_BOOKINGS_PAUSED_MESSAGE,
} from '@/hooks/useBookingPauseFlags';

function mockFlags(row: Record<string, unknown> | null, ok = true) {
  globalThis.fetch = mock(async () => ({
    ok,
    json: async () => (row ? [row] : []),
  })) as any;
}

describe('booking pause flags', () => {
  beforeEach(() => {
    mockFlags(null);
  });

  it('allows everything when both switches are off', async () => {
    mockFlags({ bookings_paused: false, bookings_paused_message: null, scheduled_bookings_paused: false });
    expect((await checkBookingAllowed('instant')).allowed).toBe(true);
    expect((await checkBookingAllowed('scheduled')).allowed).toBe(true);
  });

  it('blocks instant and scheduled when bookings_paused is on, with fallback message', async () => {
    mockFlags({ bookings_paused: true, bookings_paused_message: null, scheduled_bookings_paused: false });
    const instant = await checkBookingAllowed('instant');
    expect(instant.allowed).toBe(false);
    expect(instant.message).toBe(BOOKINGS_PAUSED_FALLBACK_MESSAGE);
    expect((await checkBookingAllowed('scheduled')).allowed).toBe(false);
  });

  it('uses the admin custom message when provided', async () => {
    mockFlags({ bookings_paused: true, bookings_paused_message: '  Closed for maintenance  ', scheduled_bookings_paused: false });
    const res = await checkBookingAllowed('instant');
    expect(res.allowed).toBe(false);
    expect(res.message).toBe('Closed for maintenance');
  });

  it('blocks only scheduled when scheduled_bookings_paused is on', async () => {
    mockFlags({ bookings_paused: false, bookings_paused_message: null, scheduled_bookings_paused: true });
    expect((await checkBookingAllowed('instant')).allowed).toBe(true);
    const scheduled = await checkBookingAllowed('scheduled');
    expect(scheduled.allowed).toBe(false);
    expect(scheduled.message).toBe(SCHEDULED_BOOKINGS_PAUSED_MESSAGE);
  });

  it('fails open when the read fails', async () => {
    mockFlags(null, false);
    expect((await checkBookingAllowed('instant')).allowed).toBe(true);
    globalThis.fetch = mock(async () => { throw new Error('network down'); }) as any;
    expect((await checkBookingAllowed('scheduled')).allowed).toBe(true);
  });

  it('maps backend pause errors to friendly messages', () => {
    expect(bookingPauseMessageFromError(new Error('BOOKINGS_PAUSED'))).toBe(BOOKINGS_PAUSED_FALLBACK_MESSAGE);
    expect(bookingPauseMessageFromError({ message: 'SCHEDULED_BOOKINGS_PAUSED: nope' })).toBe(SCHEDULED_BOOKINGS_PAUSED_MESSAGE);
    expect(bookingPauseMessageFromError(new Error('insert failed: BOOKINGS_PAUSED: stop'))).toBe(BOOKINGS_PAUSED_FALLBACK_MESSAGE);
    expect(bookingPauseMessageFromError(new Error('SUPPLY_FULL'))).toBeNull();
    expect(bookingPauseMessageFromError(null)).toBeNull();
  });
});
