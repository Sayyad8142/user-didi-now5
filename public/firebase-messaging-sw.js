// Firebase Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDDYRSiCCRslPT_vJ4xhMyEfQkOk_n2eH4",
  authDomain: "didi-now-worker-7b4cb.firebaseapp.com",
  projectId: "didi-now-worker-7b4cb",
  storageBucket: "didi-now-worker-7b4cb.firebasestorage.app",
  messagingSenderId: "993479758920",
  appId: "1:993479758920:web:1550b0d6c69afa10f6747d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const title = payload.data?.title || 'Didi Now';
  const body = payload.data?.body || 'You have a new notification';
  const bookingId = payload.data?.booking_id;

  const options = {
    body: body,
    icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    badge: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    tag: bookingId ? `booking-${bookingId}` : 'general',
    data: {
      booking_id: bookingId,
      url: bookingId ? '/bookings' : '/'
    },
    requireInteraction: true
  };

  return self.registration.showNotification(title, options);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const bookingId = event.notification.data?.booking_id;
  const urlToOpen = bookingId ? '/bookings' : '/';
  const fullUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

console.log('[SW] Firebase messaging service worker loaded');
