import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { supabase } from '@/integrations/supabase/client';
import { fetchMyBookings } from './bookingsReadClient';
import { fetchBookingOtp, OTP_V2_GATEWAY_ENABLED } from './otpGatewayClient';
import { canShowBookingOtp, otpStateKey, type OtpBookingState, type VisibleOtp } from './otpContract';
import { OtpLifecycle } from './otpLifecycle';

export function useBookingOtp(booking: OtpBookingState | null): VisibleOtp | null {
  const lifecycle = useRef(new OtpLifecycle());
  const [result, setResult] = useState<{ key: string; uid: string; value: VisibleOtp } | null>(null);
  const key = booking ? otpStateKey(booking) : '';
  const uid = getFirebaseAuth()?.currentUser?.uid ?? '';

  useEffect(() => {
    const session = lifecycle.current;
    let active = true;
    let foreground = document.visibilityState !== 'hidden';
    let controller: AbortController | null = null;
    let requestVersion = 0;
    const clear = () => {
      requestVersion++;
      session.clear();
      controller?.abort();
      setResult(null);
    };
    const refresh = async (readFreshBooking: boolean) => {
      clear();
      if (!booking || !foreground || !uid || !canShowBookingOtp(booking)) return;
      const version = requestVersion;
      controller = new AbortController();
      const requestController = controller;
      const timeout = window.setTimeout(() => requestController.abort(), 10000);
      try {
        const fresh = readFreshBooking
          ? (await fetchMyBookings(200)).find(row => row.id === booking.id) as OtpBookingState | undefined
          : booking;
        if (!active || version !== requestVersion || requestController.signal.aborted || !fresh || !foreground || !canShowBookingOtp(fresh)) return;
        const epoch = session.begin(fresh);
        const response = await fetchBookingOtp(fresh.id, requestController.signal);
        if (!active || version !== requestVersion || !foreground || getFirebaseAuth()?.currentUser?.uid !== uid) return;
        const value = session.accept(epoch, fresh, response, OTP_V2_GATEWAY_ENABLED);
        if (value) setResult({ key, uid, value });
      } catch {
        // Fail closed: do not log credentials, response bodies or transport errors.
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void refresh(true);
    const auth = getFirebaseAuth();
    const unsubscribe = auth ? onAuthStateChanged(auth, user => {
      if (user?.uid !== uid) clear();
    }) : () => {};
    const visibility = () => {
      foreground = document.visibilityState !== 'hidden';
      if (foreground) void refresh(true); else clear();
    };
    const focus = () => { if (foreground) void refresh(true); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    window.addEventListener('supabase-ready', focus);
    const channel = booking && uid ? supabase.channel(`otp-state-${booking.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${booking.id}` }, () => { void refresh(true); })
      .subscribe() : null;
    // Firebase-backed reads are the safety net when anonymous realtime cannot deliver.
    const poll = window.setInterval(() => { if (foreground) void refresh(true); }, 15000);
    const nativeListener = Capacitor.isNativePlatform() ? App.addListener('appStateChange', ({ isActive }) => {
      foreground = isActive;
      if (isActive) void refresh(true); else clear();
    }) : null;
    return () => {
      active = false;
      requestVersion++;
      session.clear();
      controller?.abort();
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', focus);
      window.removeEventListener('supabase-ready', focus);
      window.clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
      void nativeListener?.then(listener => listener.remove());
    };
    // The primitive key includes all booking fields relevant to OTP visibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid]);

  if (!booking || !canShowBookingOtp(booking) || !uid || document.visibilityState === 'hidden') return null;
  return result?.key === key && result.uid === uid ? result.value : null;
}