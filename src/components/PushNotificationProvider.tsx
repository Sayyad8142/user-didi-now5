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

  // Re-register token on app resume (handles device change mid-session)
  useEffect(() => {
    if (!userId) return;

    const platform = Capacitor.getPlatform();

    if (platform === 'android' || platform === 'ios') {
      let listenerPromise: Promise<{ remove: () => void }> | null = null;

      import('@capacitor/app').then(({ App }) => {
        listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('[Push] App resumed — re-registering token');
            forceRegister();
          }
        });
      });

      return () => {
        listenerPromise?.then(l => l.remove());
      };
    } else {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          console.log('[Push] Tab visible — re-registering token');
          forceRegister();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, [userId, forceRegister]);

  return <>{children}</>;
};
