// Firebase Cloud Messaging Service Worker
// This service worker handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase - use the same config as in the app
firebase.initializeApp({
  apiKey: "AIzaSyBXq8YQ9Z1XZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received.');
  
  event.notification.close();
  
  // Handle different notification types
  const data = event.notification.data;
  
  let url = '/';
  if (data?.type === 'INCOMING_RTC_CALL') {
    url = `/call?rtc_call_id=${data.rtc_call_id}`;
  } else if (data?.type === 'BOOKING_UPDATE') {
    url = '/bookings';
  }
  
  event.waitUntil(
    clients.openWindow(url)
  );
});
