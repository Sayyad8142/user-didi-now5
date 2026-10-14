import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBookings } from '@/features/bookings/bookingsReadClient';
import { useBookingOtp } from '@/features/bookings/useBookingOtp';
import { BookingOtpDisplay } from '@/features/bookings/BookingOtpDisplay';
import { OTP_ACTIVE_STATUSES, type OtpBookingState } from '@/features/bookings/otpContract';
import { useMandatoryRating } from '@/features/bookings/MandatoryRatingProvider';

interface OtpBooking extends OtpBookingState {
  id: string;
  status: string;
  completion_otp: string | null;
  completed_at: string | null;
  otp_verified_at?: string | null;
  created_at: string;
  worker_id?: string | null;
  worker_name?: string | null;
  service_type?: string | null;
  price_inr?: number | null;
}

// Show OTP once a worker is assigned, accepted, on the way, or started.
const OTP_VISIBLE_STATUSES = OTP_ACTIVE_STATUSES;

/**
 * HomeOtpCard
 * Shows the Completion OTP prominently on the Home screen for the latest
 * active booking. Uses bookings-read edge function (Firebase-authenticated)
 * since the Supabase client is anonymous and cannot satisfy RLS directly.
 */
export function HomeOtpCard() {
  const { profile } = useProfile();
  const [booking, setBooking] = useState<OtpBooking | null>(null);
  const { hasPending, openRatingSheet } = useMandatoryRating();

  const fetchLatestOtpBooking = useCallback(async () => {
    if (!profile?.id) {
      setBooking(null);
      return;
    }
    try {
      const all = (await fetchMyBookings(50)) as OtpBooking[];
      const match = all
        .filter(b =>
          OTP_VISIBLE_STATUSES.includes(b.status) &&
          !b.completed_at
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      setBooking(match ?? null);
    } catch (err) {
      setBooking(null);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchLatestOtpBooking();
  }, [fetchLatestOtpBooking]);

  // Realtime subscription (anonymous Supabase client may not receive these
  // when filtered by user_id under RLS — kept as best-effort signal).
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`home-otp-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${profile.id}` },
        () => fetchLatestOtpBooking()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, fetchLatestOtpBooking]);

  // Resilient refresh: poll every 15s + refetch on focus/visibility/backend-ready.
  // Realtime is unreliable on the user app (anonymous Supabase under RLS),
  // so without this the OTP only appears after a full app restart.
  useEffect(() => {
    if (!profile?.id) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchLatestOtpBooking();
    };
    const onFocus = () => fetchLatestOtpBooking();
    const onReady = () => fetchLatestOtpBooking();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('supabase-ready', onReady);
    const poll = window.setInterval(fetchLatestOtpBooking, 15000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('supabase-ready', onReady);
      window.clearInterval(poll);
    };
  }, [profile?.id, fetchLatestOtpBooking]);

  const value = useBookingOtp(booking);
  return <BookingOtpDisplay value={value} gated={hasPending} onReveal={openRatingSheet}
    workerName={booking?.worker_name} serviceType={booking?.service_type} amount={booking?.price_inr} />;
}

export default HomeOtpCard;
