// ============================================================================
// Push Deep Link Hook — handles native push tap + App Links
// ============================================================================
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { normalizeDeepLink, navigateDeepLink } from '@/lib/deepLink';

/**
 * Wire up Capacitor listeners for deep linking from push taps and App Links.
 * Must be called inside a component that has access to react-router navigate.
 */
export function usePushDeepLink(navigate: (path: string) => void) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // 1. Push notification tapped (warm / background)
    const pushSub = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log('[DeepLink] push tap data:', action.notification?.data);
        const data = action.notification?.data;
        const link = data?.deep_link || data?.link || data?.url;
        const path = normalizeDeepLink(link);
        if (path) {
          navigateDeepLink(path, navigate);
        }
      },
    );

    // 2. App Links / Custom scheme (cold start or intent)
    const urlSub = App.addListener('appUrlOpen', (event) => {
      console.log('[DeepLink] appUrlOpen:', event.url);
      const path = normalizeDeepLink(event.url);
      if (path) {
        navigateDeepLink(path, navigate);
      }
    });

    return () => {
      pushSub.then(h => h.remove());
      urlSub.then(h => h.remove());
    };
  }, [navigate]);
}
