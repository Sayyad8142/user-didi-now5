import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface OtpBooking {
  id: string;
  status: string;
  completion_otp?: string | null;
  otp_verified_at?: string | null;
}

/**
 * Standalone OTP card shown ABOVE the active booking card on the home screen.
 * Visible whenever there is an active booking with a generated completion_otp
 * that has not yet been verified. Hidden when cancelled or completed+verified.
 */
export const ActiveBookingOtpCard: React.FC = () => {
  const { profile } = useProfile();
  const [booking, setBooking] = useState<OtpBooking | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!profile?.id) { setBooking(null); return; }
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, completion_otp, otp_verified_at, booking_type, scheduled_date, created_at')
        .eq('user_id', profile.id)
        .in('status', ['pending', 'assigned', 'accepted', 'on_the_way', 'started'])
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('[OtpCard] fetched', { error, count: data?.length, rows: data });

      // Pick first booking that is instant OR scheduled for today/future
      const row = data?.find((b: any) => {
        if (b.booking_type === 'instant') return true;
        if (b.booking_type === 'scheduled' && b.scheduled_date && b.scheduled_date >= today) return true;
        return false;
      }) as OtpBooking | undefined;

      console.log('[OtpCard] selected', row);
      setBooking(row ?? null);
    } catch (err) {
      console.error('[OtpCard] fetch error:', err);
    }
  }, [profile?.id]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`active-booking-otp-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${profile.id}` },
        () => fetchBooking()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, fetchBooking]);

  if (!booking) {
    console.log('[OtpCard] no booking → null render');
    return null;
  }

  const isHidden =
    booking.status === 'cancelled' ||
    (booking.status === 'completed' && !!booking.otp_verified_at);

  const show = !!booking.completion_otp && !booking.otp_verified_at && !isHidden;
  console.log('[OtpCard] decision', { status: booking.status, otp: booking.completion_otp, verified: booking.otp_verified_at, show });
  if (!show) return null;

  const otpDigits = (booking.completion_otp || '').slice(0, 3).split('');

  return (
    <>
      <Card className="relative overflow-hidden p-4 rounded-3xl bg-emerald-50 ring-1 ring-emerald-200 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.12)] animate-fade-in">
        <button
          type="button"
          onClick={() => setShowSheet(true)}
          className="w-full flex flex-col gap-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-100 ring-1 ring-emerald-200 shrink-0">
              <KeyRound className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80 leading-none">
                Completion OTP
              </p>
              <p className="text-[11px] text-emerald-700/70 mt-1 leading-tight">
                Share only after service completion
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 w-full">
            {otpDigits.map((digit, i) => (
              <span
                key={i}
                className="flex-1 max-w-[72px] h-14 flex items-center justify-center bg-white ring-1 ring-emerald-300 rounded-xl text-3xl font-extrabold text-emerald-900 tabular-nums shadow-sm"
              >
                {digit}
              </span>
            ))}
          </div>
        </button>
      </Card>

      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-10 pt-6">
          <SheetHeader className="text-center sm:text-center">
            <div className="mx-auto mb-2 p-3 rounded-2xl bg-emerald-50 w-fit">
              <KeyRound className="w-5 h-5 text-emerald-700" />
            </div>
            <SheetTitle className="text-center">Completion OTP</SheetTitle>
            <SheetDescription className="text-center">
              Share this OTP with your worker only after the work is fully completed.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex items-center justify-center gap-3">
            {otpDigits.map((digit, i) => (
              <span
                key={i}
                className="w-20 h-24 flex items-center justify-center bg-emerald-50 ring-2 ring-emerald-200 rounded-2xl text-5xl font-extrabold text-emerald-900 tabular-nums shadow-sm"
              >
                {digit}
              </span>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Sharing OTP early may complete the booking before the work is done.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ActiveBookingOtpCard;
