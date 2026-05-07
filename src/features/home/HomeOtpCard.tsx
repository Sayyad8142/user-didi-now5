import React, { useEffect, useState, useCallback } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBookings } from '@/features/bookings/bookingsReadClient';

interface OtpBooking {
  id: string;
  status: string;
  completion_otp: string | null;
  completed_at: string | null;
  otp_verified_at?: string | null;
  created_at: string;
}

const OTP_VISIBLE_STATUSES = ['assigned', 'accepted', 'on_the_way', 'started'];

/**
 * HomeOtpCard
 * Shows the Completion OTP prominently on the Home screen for the latest
 * active booking. Uses bookings-read edge function (Firebase-authenticated)
 * since the Supabase client is anonymous and cannot satisfy RLS directly.
 */
export function HomeOtpCard() {
  const { profile } = useProfile();
  const [booking, setBooking] = useState<OtpBooking | null>(null);

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
          !!b.completion_otp &&
          !b.completed_at &&
          !b.otp_verified_at
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      setBooking(match ?? null);
    } catch (err) {
      console.warn('[HomeOtpCard] fetch error:', err);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchLatestOtpBooking();
  }, [fetchLatestOtpBooking]);

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

  if (!booking || !booking.completion_otp) return null;
  if (!OTP_VISIBLE_STATUSES.includes(booking.status)) return null;
  if (booking.completed_at || booking.otp_verified_at) return null;

  const digits = booking.completion_otp.split('');

  return (
    <section
      aria-label="Completion OTP"
      className="my-2 px-3 py-2 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 flex items-center gap-2"
    >
      <div className="p-1.5 rounded-lg bg-emerald-100 ring-1 ring-emerald-200 shrink-0">
        <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 shrink-0">
        OTP
      </p>
      <div className="flex items-center gap-0.5 ml-auto">
        {digits.map((digit, i) => (
          <span
            key={i}
            className="w-6 h-7 flex items-center justify-center bg-white ring-1 ring-emerald-300 rounded text-sm font-extrabold text-emerald-900 tabular-nums"
          >
            {digit}
          </span>
        ))}
      </div>
    </section>
  );
}

export default HomeOtpCard;
