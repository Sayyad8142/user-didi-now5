// src/components/PushNotificationProvider.tsx
import React, { ReactNode, useCallback, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Capacitor } from "@capacitor/core";

interface Props {
  children: ReactNode;
}

export const PushNotificationProvider: React.FC<Props> = ({ children }) => {
  const { profile, loading } = useProfile();
  const userId = !loading ? profile?.id ?? null : null;

  // Registration, foreground handling, and toasts are all inside the hook now
  const { forceRegister } = usePushNotifications({ userId });

  // Re-register token on app resume — TTL-guarded.
  // Only re-register if last successful registration is older than 24h, so
  // quick reopens don't spam the backend with register-user-fcm-token calls.
  useEffect(() => {
    if (!userId) return;

    const REGISTER_TTL = 24 * 60 * 60 * 1000; // 24h
    const STORAGE_KEY = `didi_fcm_last_register_${userId}`;

    const shouldReregister = () => {
      try {
        const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
        return Date.now() - last > REGISTER_TTL;
      } catch {
        return true;
      }
    };
    const stamp = () => {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    };

    // Stamp on first mount so we don't immediately re-register
    stamp();

    const platform = Capacitor.getPlatform();

    if (platform === 'android' || platform === 'ios') {
      let listenerPromise: Promise<{ remove: () => void }> | null = null;

      import('@capacitor/app').then(({ App }) => {
        listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          if (!shouldReregister()) {
            console.log('[Push] Skip re-register (within 24h TTL)');
            return;
          }
          console.log('[Push] App resumed (>24h) — re-registering token');
          forceRegister();
          stamp();
        });
      });

      return () => {
        listenerPromise?.then(l => l.remove());
      };
    } else {
      const handleVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        if (!shouldReregister()) {
          console.log('[Push] Skip re-register (within 24h TTL)');
          return;
        }
        console.log('[Push] Tab visible (>24h) — re-registering token');
        forceRegister();
        stamp();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, [userId, forceRegister]);

  return <>{children}</>;
};
