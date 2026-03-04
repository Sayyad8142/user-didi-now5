// ============================================================================
// Firebase Messaging Service Worker — handles background push + deep links
// ============================================================================
/* eslint-disable no-restricted-globals */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCJJ7PqGC890D92R5m5P5bHRB7k6AyomKo',
  authDomain: 'didinowusernew.firebaseapp.com',
  projectId: 'didinowusernew',
  storageBucket: 'didinowusernew.firebasestorage.app',
  messagingSenderId: '767811736462',
  appId: '1:767811736462:web:b4ac74852f1f56db1ccadf',
});

const messaging = firebase.messaging();

// Background message handler — show notification with deep_link in data
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'Didi Now';
  const body = data.body || payload.notification?.body || '';

  const options = {
    body,
    icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    badge: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    tag: data.booking_id ? `booking-${data.booking_id}` : 'general',
    data: { deep_link: data.deep_link || null, ...data },
  };

  self.registration.showNotification(title, options);
});

// Notification click — open/focus app at deep link path
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const deepLink = data.deep_link || null;
  const baseUrl = 'https://app.didisnow.com';
  const targetUrl = deepLink ? `${baseUrl}${deepLink}` : baseUrl + '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          client.focus();
          // Post message so the app can navigate
          client.postMessage({ type: 'DEEP_LINK', path: deepLink });
          return;
        }
      }
      // No existing window — open new
      return self.clients.openWindow(targetUrl);
    }),
  );
});
