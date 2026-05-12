// Firebase identity + Web Push only.
//
// OTP delivery + verification: Twilio Verify (via `twilio-send-otp` and
// `twilio-verify-otp` edge functions). Twilio mints a Firebase Custom Token
// bound to deterministic uid `phone:+91XXXXXXXXXX`; we then call
// signInWithCustomToken() to get a real Firebase session — so the rest of
// the app (firebase_uid, getFirebaseIdToken, x-firebase-token, profiles
// linkage) is unchanged.
//
// reCAPTCHA and @capacitor-firebase/authentication are no longer used.
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithCustomToken,
  onAuthStateChanged,
  User,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getMessaging, Messaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const firebaseConfig = {
  apiKey: 'AIzaSyCJJ7PqGC890D92R5m5P5bHRB7k6AyomKo',
  authDomain: 'didinowusernew.firebaseapp.com',
  projectId: 'didinowusernew',
  storageBucket: 'didinowusernew.firebasestorage.app',
  messagingSenderId: '767811736462',
  appId: '1:767811736462:web:b4ac74852f1f56db1ccadf',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let messaging: Messaging | null = null;

// Last phone an OTP was sent to — used by verifyOtp when caller doesn't pass it.
let lastOtpPhone: string | null = null;

export const isFirebaseConfigured = (): boolean =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

// Platform checks (kept for backward compat with callers).
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';
export const isWeb = (): boolean => !Capacitor.isNativePlatform();


// ─── Firebase init ────────────────────────────────────────────────────
export const getFirebaseApp = (): FirebaseApp | null => {
  if (!isFirebaseConfigured()) {
    console.warn('⚠️ Firebase not configured');
    return null;
  }
  if (!app) {
    try {
      const existing = getApps();
      app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
      console.log('✅ Firebase initialized');
    } catch (error) {
      console.error('❌ Firebase init error:', error);
      return null;
    }
  }
  return app;
};

export const getFirebaseAuth = (): Auth | null => {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!auth) {
    try {
      auth = getAuth(a);
      console.log('✅ Firebase Auth initialized');
    } catch (error) {
      console.error('❌ Firebase Auth init error:', error);
      return null;
    }
  }
  return auth;
};

// ─── OTP via Twilio + Firebase Custom Token ───────────────────────────

const normalizePhone = (raw: string): string => {
  const trimmed = (raw || '').replace(/\s+/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return trimmed;
};

// Send OTP via Twilio Verify. `containerId` is ignored — kept for backward
// compatibility with old call sites that passed a reCAPTCHA container.
export const sendOtp = async (
  phoneNumber: string,
  _containerId?: string,
): Promise<{ success: boolean; error?: string }> => {
  const phone = normalizePhone(phoneNumber);
  console.log('[OTP] sendOtp via Twilio', { phone, platform: Capacitor.getPlatform() });

  try {
    const { data, error } = await supabase.functions.invoke('twilio-send-otp', {
      body: { phone },
    });

    if (error) {
      console.error('[OTP] twilio-send-otp invoke error:', error);
      // Edge function returns 4xx with { error } in `data` when it's a known failure (e.g. rate limit)
      const msg =
        (data && typeof data === 'object' && (data as any).error) ||
        error.message ||
        'Failed to send OTP';
      return { success: false, error: String(msg) };
    }
    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to send OTP' };
    }

    lastOtpPhone = phone;
    return { success: true };
  } catch (e: any) {
    console.error('[OTP] sendOtp threw:', e);
    return { success: false, error: e?.message || 'Failed to send OTP' };
  }
};

// Verify OTP via Twilio, then sign into Firebase with the returned custom token.
// Backward compatible: callers may pass either (code) or (phone, code).
export const verifyOtp = async (
  arg1: string,
  arg2?: string,
): Promise<{ success: boolean; user?: User; error?: string }> => {
  const phone = normalizePhone(arg2 ? arg1 : (lastOtpPhone || ''));
  const code = (arg2 ?? arg1 ?? '').trim();

  if (!phone) return { success: false, error: 'Session expired. Please resend OTP.' };
  if (!/^\d{4,8}$/.test(code)) return { success: false, error: 'Invalid verification code' };

  try {
    const { data, error } = await supabase.functions.invoke('twilio-verify-otp', {
      body: { phone, code },
    });

    if (error) {
      const msg =
        (data && typeof data === 'object' && (data as any).error) ||
        error.message ||
        'Invalid verification code';
      return { success: false, error: String(msg) };
    }
    if (!data?.success || !data?.firebaseCustomToken) {
      return { success: false, error: data?.error || 'Verification failed' };
    }

    const authInstance = getFirebaseAuth();
    if (!authInstance) return { success: false, error: 'Firebase Auth not initialized' };

    const cred = await signInWithCustomToken(authInstance, data.firebaseCustomToken);
    lastOtpPhone = null;
    console.log('✅ Firebase signInWithCustomToken success:', cred.user.uid);

    return { success: true, user: cred.user };
  } catch (e: any) {
    console.error('[OTP] verifyOtp threw:', e);
    return { success: false, error: e?.message || 'Verification failed' };
  }
};

// ─── Session helpers ──────────────────────────────────────────────────
export const getCurrentUser = (): User | null => getFirebaseAuth()?.currentUser ?? null;

export const onFirebaseAuthStateChanged = (callback: (user: User | null) => void): (() => void) => {
  const a = getFirebaseAuth();
  if (!a) {
    console.warn('⚠️ Auth not available for state listener');
    return () => {};
  }
  return onAuthStateChanged(a, callback);
};

export const signOut = async (): Promise<void> => {
  const a = getFirebaseAuth();
  if (a) {
    await firebaseSignOut(a);
    console.log('✅ Firebase signed out');
  }
};

export const waitForFirebaseAuthReady = async (timeoutMs = 8000): Promise<User | null> => {
  const a = getFirebaseAuth();
  if (!a) return null;
  if (a.currentUser) return a.currentUser;

  return new Promise<User | null>((resolve) => {
    let settled = false;
    const unsubscribe = onAuthStateChanged(a, (user) => {
      if (user && !settled) {
        settled = true;
        try { unsubscribe(); } catch {}
        resolve(user);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        try { unsubscribe(); } catch {}
        resolve(a.currentUser);
      }
    }, timeoutMs);
  });
};

export const getFirebaseIdToken = async (forceRefresh = false): Promise<string | null> => {
  const a = getFirebaseAuth();
  if (a?.currentUser) {
    try {
      return await a.currentUser.getIdToken(forceRefresh);
    } catch (error) {
      console.error('❌ Error getting ID token (will retry after hydrate):', error);
    }
  }
  const hydrated = await waitForFirebaseAuthReady(8000);
  if (hydrated) {
    try {
      return await hydrated.getIdToken(forceRefresh);
    } catch (e) {
      console.error('❌ Error getting ID token after hydration:', e);
    }
    try {
      return await hydrated.getIdToken(false);
    } catch (e) {
      console.error('❌ Error getting ID token (retry):', e);
    }
  }
  return null;
};

// ─── Firebase Messaging (Web Push) ───────────────────────────────────
export const getFirebaseMessaging = (): Messaging | null => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('⚠️ Service workers not supported');
    return null;
  }
  const a = getFirebaseApp();
  if (!a) return null;
  if (!messaging) {
    try {
      messaging = getMessaging(a);
      console.log('✅ Firebase Messaging initialized');
    } catch (error) {
      console.error('❌ Firebase Messaging init error:', error);
      return null;
    }
  }
  return messaging;
};

const VAPID_KEY = 'BDSqlP418hdP33VE8JvLy47_9bUruhjq8_a4lwfcTDCFwf8awj9UUgLv9oMFHVPPhMQTveDZuW44NtMyYXqk82RU';

export const getFcmToken = async (): Promise<string | null> => {
  const messagingInstance = getFirebaseMessaging();
  if (!messagingInstance) {
    console.error('❌ Messaging not available');
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    console.log('✅ Service worker registered:', registration.scope);
    await navigator.serviceWorker.ready;

    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
      return token;
    }
    console.warn('⚠️ No FCM token available');
    return null;
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
};

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

export const showForegroundNotification = (payload: MessagePayload): void => {
  const title = payload.data?.title || payload.notification?.title || 'Didi Now';
  const body = payload.data?.body || payload.notification?.body || '';
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
      tag: payload.data?.booking_id ? `booking-${payload.data.booking_id}` : 'general',
    });
  }
};
