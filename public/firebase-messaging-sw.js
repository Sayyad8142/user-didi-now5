// Firebase Messaging Service Worker for background push notifications

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase config - will be populated at runtime
// For now, use placeholder - the actual config comes from main app
firebase.initializeApp({
  apiKey: "placeholder",
  authDomain: "placeholder.firebaseapp.com",
  projectId: "placeholder",
  storageBucket: "placeholder.appspot.com",
  messagingSenderId: "placeholder",
  appId: "placeholder"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.data?.title || payload.notification?.title || 'Didi Now';
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || 'You have a new notification',
    icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    badge: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    data: payload.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  event.notification.close();

  const bookingId = event.notification.data?.booking_id;
  let urlToOpen = '/';

  if (bookingId) {
    urlToOpen = '/bookings';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (bookingId) {
            client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Open new window if app not open
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
