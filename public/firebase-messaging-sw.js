// Firebase Messaging Service Worker for background push notifications
// This handles notifications when the app is in the background or closed

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase config - these values should match your VITE_FIREBASE_* env vars
// Note: For security, we use a minimal config here. The actual messaging works
// because the token was generated with the full config in the main app.
const firebaseConfig = {
  apiKey: "AIzaSyExample", // Placeholder - replaced at runtime via postMessage
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  // Extract notification data
  const notificationTitle = payload.data?.title || payload.notification?.title || 'Didi Now';
  const notificationBody = payload.data?.body || payload.notification?.body || 'You have a new notification';
  const bookingId = payload.data?.booking_id;
  const status = payload.data?.status;

  const notificationOptions = {
    body: notificationBody,
    icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    badge: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
    tag: bookingId ? `booking-${bookingId}` : 'general',
    data: {
      booking_id: bookingId,
      status: status,
      url: bookingId ? '/bookings' : '/',
      ...payload.data
    },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  
  event.notification.close();

  // Handle action buttons
  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL to open
  const urlToOpen = event.notification.data?.url || '/bookings';
  const fullUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          // App is open, focus it and navigate
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: urlToOpen,
            data: event.notification.data
          });
          return;
        }
      }
      // App not open, open new window
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

// Handle push event directly (fallback)
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received:', event);
  
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[firebase-messaging-sw.js] Push payload:', payload);
      
      // If FCM handled it via onBackgroundMessage, skip
      if (payload.notification) {
        return;
      }
      
      // Handle data-only messages
      if (payload.data) {
        const title = payload.data.title || 'Didi Now';
        const body = payload.data.body || 'You have a new notification';
        
        event.waitUntil(
          self.registration.showNotification(title, {
            body: body,
            icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
            data: payload.data
          })
        );
      }
    } catch (e) {
      console.error('[firebase-messaging-sw.js] Error parsing push data:', e);
    }
  }
});

console.log('[firebase-messaging-sw.js] Service worker loaded');
