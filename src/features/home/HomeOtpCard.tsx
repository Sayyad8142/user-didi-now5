import React, { useEffect, useState, useCallback } from 'react';
import { KeyRound, Eye, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBookings } from '@/features/bookings/bookingsReadClient';
import { shareOtpOnWhatsApp } from '@/lib/whatsappShare';
import { useMandatoryRating } from '@/features/bookings/MandatoryRatingProvider';

interface OtpBooking {
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

  if (!booking || !booking.completion_otp) return null;
  if (!OTP_VISIBLE_STATUSES.includes(booking.status)) return null;
  if (booking.completed_at || booking.otp_verified_at) return null;

  const digits = booking.completion_otp.split('');
  const { hasPending, openRatingSheet } = useMandatoryRating();
  const gated = hasPending;

  // Analytics: gate shown
  useEffect(() => {
    if (gated) {
      try {
        console.log('[analytics] otp_rating_gate_shown', {
          booking_id: booking.id,
          timestamp: Date.now(),
        });
      } catch {}
    }
  }, [gated, booking.id]);

  const handleReveal = () => {
    try {
      console.log('[analytics] otp_gate_eye_clicked', { booking_id: booking.id });
    } catch {}
    openRatingSheet();
  };

  const handleShare = async () => {
    const ok = await shareOtpOnWhatsApp({
      workerName: booking.worker_name ?? null,
      serviceType: booking.service_type ?? null,
      otp: booking.completion_otp,
      amount: booking.price_inr ?? undefined,
    });
    if (ok) {
      try {
        console.log('[analytics] otp_shared_whatsapp', {
          booking_id: booking.id,
          worker_id: booking.worker_id,
          source: 'home_otp_card',
          timestamp: Date.now(),
        });
      } catch {}
    } else {
      toast.error('WhatsApp is not installed on this device.');
    }
  };

  return (
    <section
      aria-label="Completion OTP"
      className="my-2 px-3 py-2.5 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 relative overflow-hidden"
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-emerald-100 ring-1 ring-emerald-200 shrink-0">
          <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 shrink-0">
          OTP
        </p>
        <div
          className={`flex items-center gap-0.5 ml-auto transition-all duration-300 ${
            gated ? 'blur-md select-none pointer-events-none' : ''
          }`}
          aria-hidden={gated}
        >
          {digits.map((digit, i) => (
            <span
              key={i}
              className="w-6 h-7 flex items-center justify-center bg-white ring-1 ring-emerald-300 rounded text-sm font-extrabold text-emerald-900 tabular-nums"
            >
              {gated ? '•' : digit}
            </span>
          ))}
        </div>
      </div>

      {gated && (
        <button
          type="button"
          onClick={handleReveal}
          aria-label="Rate previous service to reveal OTP"
          className="mt-2 w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-white ring-1 ring-emerald-300 text-emerald-800 font-semibold text-[12px] shadow-sm hover:bg-emerald-50 active:scale-[0.99] transition"
        >
          <span className="relative inline-flex items-center justify-center">
            <Eye className="w-4 h-4" />
            <Lock className="w-2.5 h-2.5 absolute -bottom-1 -right-1 text-emerald-600 bg-white rounded-full p-[1px] ring-1 ring-emerald-200 animate-pulse" />
          </span>
          Tap to reveal · Rate your last service first
        </button>
      )}
      {!gated && (

      <div className="mt-2 pt-2 border-t border-emerald-200/70 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-emerald-900 leading-tight">Booked for someone else?</p>
          <p className="text-[10px] text-emerald-800/70 leading-tight">Share OTP & details on WhatsApp</p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share OTP on WhatsApp"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#25D366] hover:bg-[#1ebe57] text-white font-semibold text-[12px] shadow-sm transition-colors active:scale-[0.99] shrink-0"
        >
          <svg viewBox="0 0 32 32" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
            <path d="M19.11 17.27c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47l-.52-.01c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.64 1.11 2.82.14.18 1.93 2.95 4.68 4.13.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32zM16.05 5.33c-5.91 0-10.71 4.81-10.71 10.72 0 1.89.49 3.73 1.43 5.36L5 27l5.74-1.5a10.7 10.7 0 0 0 5.31 1.4h.01c5.9 0 10.71-4.81 10.71-10.72 0-2.86-1.12-5.55-3.15-7.58a10.65 10.65 0 0 0-7.57-3.17zm0 19.55h-.01a8.83 8.83 0 0 1-4.52-1.24l-.32-.19-3.41.89.91-3.32-.21-.34a8.84 8.84 0 0 1-1.36-4.74c0-4.92 4-8.92 8.92-8.92 2.38 0 4.62.93 6.31 2.62a8.86 8.86 0 0 1 2.61 6.31c0 4.92-4 8.92-8.92 8.92z"/>
          </svg>
          Share
        </button>
      </div>
      )}
    </section>

  );
}

export default HomeOtpCard;
