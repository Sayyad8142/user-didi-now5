/**
 * Admin Panel "Stop Taking Bookings" switches (shared app_config table).
 *
 * Every edge function that creates a booking, pending booking, or payment
 * order must call `bookingPauseBlock()` BEFORE taking money or inserting,
 * and return HTTP 409 with the block payload when it returns non-null.
 *
 * Exception: the post-payment step that converts an already-paid order
 * into a booking must NOT be blocked — the customer has paid.
 *
 * Fail-open: if app_config cannot be read, booking creation proceeds —
 * the DB trigger (BOOKINGS_PAUSED:/SCHEDULED_BOOKINGS_PAUSED:) remains
 * the authoritative backstop for direct inserts.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BookingPauseFlags {
  bookingsPaused: boolean;
  scheduledPaused: boolean;
  message: string | null;
}

export const BOOKINGS_PAUSED_FALLBACK_MESSAGE =
  "We are not taking new bookings right now. Please try again later.";

export const SCHEDULED_BOOKINGS_PAUSED_MESSAGE =
  "We are not taking scheduled bookings right now. Please book an instant service or try again later.";

export async function getBookingPauseFlags(
  supabase: SupabaseClient,
): Promise<BookingPauseFlags> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("bookings_paused, bookings_paused_message, scheduled_bookings_paused")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) {
        console.warn("[bookingPause] app_config read failed (fail-open):", error.message);
      }
      return { bookingsPaused: false, scheduledPaused: false, message: null };
    }
    const customMessage =
      typeof data.bookings_paused_message === "string" &&
      data.bookings_paused_message.trim().length > 0
        ? data.bookings_paused_message.trim()
        : null;
    return {
      bookingsPaused: data.bookings_paused === true,
      scheduledPaused: data.scheduled_bookings_paused === true,
      message: customMessage,
    };
  } catch (err) {
    console.warn("[bookingPause] app_config read threw (fail-open):", err);
    return { bookingsPaused: false, scheduledPaused: false, message: null };
  }
}

/**
 * Returns the 409 payload when the given booking type is currently blocked,
 * or null when booking may proceed.
 */
export function bookingPauseBlock(
  flags: BookingPauseFlags,
  bookingType: unknown,
): { error: string; message: string } | null {
  if (flags.bookingsPaused) {
    return {
      error: "BOOKINGS_PAUSED",
      message: flags.message || BOOKINGS_PAUSED_FALLBACK_MESSAGE,
    };
  }
  if (bookingType === "scheduled" && flags.scheduledPaused) {
    return {
      error: "SCHEDULED_BOOKINGS_PAUSED",
      message: SCHEDULED_BOOKINGS_PAUSED_MESSAGE,
    };
  }
  return null;
}
