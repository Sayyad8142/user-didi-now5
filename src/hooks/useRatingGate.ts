/**
 * Pre-payment rating gate.
 *
 * Centralizes the rule: "if the user has a completed booking that is not
 * yet rated (after the rollout date), they must rate it before starting
 * any new booking payment".
 *
 * Returns a small API the booking screens can call BEFORE opening Razorpay
 * or the payment picker, so the user is never charged when the backend
 * would reject the booking with RATING_REQUIRED.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnratedBooking } from './useUnratedBooking';

export function useRatingGate() {
  const navigate = useNavigate();
  const { unratedBooking, hasUnratedBooking, invalidate } = useUnratedBooking();
  const [open, setOpen] = useState(false);

  /**
   * Call this BEFORE starting any payment.
   * Returns true if the user can continue, false if the gate is blocking.
   */
  const checkBeforePayment = useCallback((): boolean => {
    if (hasUnratedBooking && unratedBooking) {
      console.warn('[RatingGate] Blocking payment — unrated booking:', unratedBooking.id);
      setOpen(true);
      return false;
    }
    return true;
  }, [hasUnratedBooking, unratedBooking]);

  /** Called when user taps "Rate Previous Booking" */
  const goRateNow = useCallback(() => {
    if (!unratedBooking) {
      navigate('/bookings');
      return;
    }
    console.info('[RatingGate] Routing to booking detail to rate:', unratedBooking.id);
    // BookingDetail screen surfaces the inline RateWorker component for
    // completed bookings, so the user lands directly on the rating UI.
    navigate(`/booking/${unratedBooking.id}`);
  }, [unratedBooking, navigate]);

  /** Manually open / close the dialog (for backend fallback path). */
  const openDialog = useCallback(() => setOpen(true), []);

  return {
    /** Pass to <RatingRequiredDialog open={...} /> */
    dialogOpen: open,
    setDialogOpen: setOpen,
    /** Service type label (e.g. "maid") of the unrated booking, for the dialog copy */
    unratedServiceType: unratedBooking?.service_type ?? null,
    /** True iff the user currently has an unrated completed booking */
    hasUnratedBooking,
    /** Pre-payment guard. Returns true if safe to continue. */
    checkBeforePayment,
    /** Navigate user to the rating UI for the blocked booking */
    goRateNow,
    /** Force open the dialog (e.g. backend fallback) */
    openDialog,
    /** Refresh the unrated query (call after rating submit) */
    refresh: invalidate,
  };
}
