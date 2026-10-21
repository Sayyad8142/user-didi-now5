import { useQuery } from '@tanstack/react-query';
import { DIRECT_SUPABASE_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

/**
 * Admin Panel "Stop Taking Bookings" switches, stored in the shared
 * app_config table (single row, oldest by created_at):
 *
 *   bookings_paused            — block ALL new bookings (instant + scheduled)
 *   bookings_paused_message    — optional custom customer message
 *   scheduled_bookings_paused  — block only scheduled bookings
 *
 * The app reads these directly (public read) and re-checks right before
 * payment. Backend functions enforce the same flags before creating
 * payment orders / bookings; the DB trigger is the final backstop.
 *
 * Fail-open: if the read fails (network), we do NOT block the customer —
 * the server-side check and DB trigger still enforce the pause.
 */

export interface BookingPauseFlags {
  bookingsPaused: boolean;
  scheduledPaused: boolean;
  /** Custom message from admin, null when not set */
  message: string | null;
}

export const BOOKINGS_PAUSED_FALLBACK_MESSAGE =
  'We are not taking new bookings right now. Please try again later.';

export const SCHEDULED_BOOKINGS_PAUSED_MESSAGE =
  'We are not taking scheduled bookings right now. Please book an instant service or try again later.';

const OPEN: BookingPauseFlags = {
  bookingsPaused: false,
  scheduledPaused: false,
  message: null,
};

export async function fetchBookingPauseFlags(): Promise<BookingPauseFlags> {
  try {
    const res = await fetch(
      `${DIRECT_SUPABASE_URL}/rest/v1/app_config?select=bookings_paused,bookings_paused_message,scheduled_bookings_paused&order=created_at.asc&limit=1`,
      {
        headers: {
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
          'Cache-Control': 'no-cache',
        },
      },
    );
    if (!res.ok) return OPEN;
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : {};
    const customMessage =
      typeof row.bookings_paused_message === 'string' &&
      row.bookings_paused_message.trim().length > 0
        ? row.bookings_paused_message.trim()
        : null;
    return {
      bookingsPaused: row.bookings_paused === true,
      scheduledPaused: row.scheduled_bookings_paused === true,
      message: customMessage,
    };
  } catch {
    return OPEN;
  }
}

/**
 * Cached flags for UI (banners, disabled buttons). Refreshes at most every
 * 30s and re-fetches in the background every minute — never cached longer.
 */
export function useBookingPauseFlags(): BookingPauseFlags & { isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['app_config', 'booking_pause_flags'],
    queryFn: fetchBookingPauseFlags,
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  return { ...(data ?? OPEN), isLoading };
}

/**
 * Fresh (uncached) check used right before payment / booking confirmation.
 * Returns the customer-facing message when the booking type is blocked.
 */
export async function checkBookingAllowed(
  bookingType: 'instant' | 'scheduled',
): Promise<{ allowed: boolean; message: string | null }> {
  const flags = await fetchBookingPauseFlags();
  if (flags.bookingsPaused) {
    return {
      allowed: false,
      message: flags.message || BOOKINGS_PAUSED_FALLBACK_MESSAGE,
    };
  }
  if (bookingType === 'scheduled' && flags.scheduledPaused) {
    return { allowed: false, message: SCHEDULED_BOOKINGS_PAUSED_MESSAGE };
  }
  return { allowed: true, message: null };
}

/**
 * Map a backend/DB error to the friendly pause message, or null when the
 * error is unrelated to the pause switches.
 */
export function bookingPauseMessageFromError(error: unknown): string | null {
  const msg =
    typeof error === 'string'
      ? error
      : (error as any)?.message || String(error ?? '');
  if (!msg) return null;
  if (msg.includes('SCHEDULED_BOOKINGS_PAUSED')) {
    return SCHEDULED_BOOKINGS_PAUSED_MESSAGE;
  }
  if (msg.includes('BOOKINGS_PAUSED')) {
    return BOOKINGS_PAUSED_FALLBACK_MESSAGE;
  }
  return null;
}
