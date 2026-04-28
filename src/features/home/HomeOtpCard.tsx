import React, { useEffect, useState, useCallback } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

interface OtpBooking {
  id: string;
  status: string;
  completion_otp: string | null;
  otp_verified_at: string | null;
  created_at: string;
}

const OTP_VISIBLE_STATUSES = ['assigned', 'on_the_way', 'started'];

/**
 * HomeOtpCard
 * Shows the Completion OTP prominently on the Home screen for the latest
 * active booking with status in (assigned, on_the_way, started).
 * UI-only — does not modify booking/payment/OTP logic.
 */
export function HomeOtpCard() {
  const { profile } = useProfile();
  const [booking, setBooking] = useState<OtpBooking | null>(null);

  const fetchLatestOtpBooking = useCallback(async () => {
    if (!profile?.id) {
      setBooking(null);
      return;
    }
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, completion_otp, otp_verified_at, created_at')
      .eq('user_id', profile.id)
      .in('status', OTP_VISIBLE_STATUSES)
      .is('otp_verified_at', null)
      .not('completion_otp', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[HomeOtpCard] fetch error:', error);
      return;
    }
    setBooking((data as OtpBooking) ?? null);
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
  if (booking.otp_verified_at) return null;

  const digits = booking.completion_otp.split('');

  return (
    <section
      aria-label="Completion OTP"
      className="my-3 px-4 py-4 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200"
      style={{ borderRadius: 16 }}
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <div className="p-2 rounded-xl bg-emerald-100 ring-1 ring-emerald-200">
          <KeyRound className="w-4 h-4 text-emerald-700" />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 leading-none">
            Completion OTP
          </p>
          <p className="text-[11px] text-emerald-700/70 mt-1 leading-tight">
            Share only after service completion
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        {digits.map((digit, i) => (
          <span
            key={i}
            className="w-12 h-14 flex items-center justify-center bg-white ring-1 ring-emerald-300 rounded-xl text-2xl font-extrabold text-emerald-900 tabular-nums shadow-sm"
          >
            {digit}
          </span>
        ))}
      </div>
    </section>
  );
}

export default HomeOtpCard;
