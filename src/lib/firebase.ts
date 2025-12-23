// Firebase Web Push Configuration
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getMessaging, Messaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

// Check if Firebase is configured
export const isFirebaseConfigured = (): boolean => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  );
};

// Initialize Firebase (lazy, singleton)
export const getFirebaseApp = (): FirebaseApp | null => {
  if (!isFirebaseConfigured()) {
    console.warn('⚠️ Firebase not configured - missing env variables');
    return null;
  }
  
  if (!app) {
    try {
      // Check if already initialized
      const existingApps = getApps();
      if (existingApps.length > 0) {
        app = existingApps[0];
      } else {
        app = initializeApp(firebaseConfig);
      }
      console.log('✅ Firebase initialized');
    } catch (error) {
      console.error('❌ Firebase init error:', error);
      return null;
    }
  }
  return app;
};

// Get Firebase Messaging instance
export const getFirebaseMessaging = (): Messaging | null => {
  // Check if we're in a browser with service worker support
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('⚠️ Service workers not supported');
    return null;
  }
  
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  
  if (!messaging) {
    try {
      messaging = getMessaging(firebaseApp);
      console.log('✅ Firebase Messaging initialized');
    } catch (error) {
      console.error('❌ Firebase Messaging init error:', error);
      return null;
    }
  }
  return messaging;
};

// Get FCM token for web push
export const getFcmToken = async (): Promise<string | null> => {
  const messagingInstance = getFirebaseMessaging();
  if (!messagingInstance) {
    console.error('❌ Messaging not available');
    return null;
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.error('❌ Missing VITE_FIREBASE_VAPID_KEY');
    return null;
  }

  try {
    // Register service worker first
    let registration: ServiceWorkerRegistration;
    
    try {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      console.log('✅ Service worker registered:', registration.scope);
      
      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
    } catch (swError) {
      console.error('❌ Service worker registration failed:', swError);
      throw swError;
    }

    // Get FCM token with the service worker registration
    const token = await getToken(messagingInstance, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('⚠️ No FCM token available - permission may be denied');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
};

// Listen for foreground messages
export const onForegroundMessage = (callback: (payload: MessagePayload) => void): (() => void) => {
  const messagingInstance = getFirebaseMessaging();
  if (!messagingInstance) {
    console.warn('⚠️ Messaging not available for foreground listener');
    return () => {};
  }
  
  return onMessage(messagingInstance, (payload) => {
    console.log('📩 Foreground message received:', payload);
    callback(payload);
  });
};

// Helper to show in-app notification for foreground messages
export const showForegroundNotification = (payload: MessagePayload): void => {
  const title = payload.data?.title || payload.notification?.title || 'Didi Now';
  const body = payload.data?.body || payload.notification?.body || '';
  
  // Use browser Notification API for foreground
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
      tag: payload.data?.booking_id ? `booking-${payload.data.booking_id}` : 'general',
    });
  }
};
