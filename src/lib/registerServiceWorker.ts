// Register Firebase messaging service worker (web only, skip on native Capacitor)
import { Capacitor } from '@capacitor/core';

export function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/firebase-messaging-sw.js', { scope: '/' })
    .then((reg) => {
      if (import.meta.env.DEV) {
        console.log('[SW] registered, scope:', reg.scope);
      }
    })
    .catch((err) => {
      console.error('[SW] registration failed:', err);
    });
}
