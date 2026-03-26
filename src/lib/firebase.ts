// Firebase Configuration for Phone Auth and Web Push
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  Auth,
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  ConfirmationResult,
  onAuthStateChanged,
  User,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { getMessaging, Messaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCJJ7PqGC890D92R5m5P5bHRB7k6AyomKo",
  authDomain: "didinowusernew.firebaseapp.com",
  projectId: "didinowusernew",
  storageBucket: "didinowusernew.firebasestorage.app",
  messagingSenderId: "767811736462",
  appId: "1:767811736462:web:b4ac74852f1f56db1ccadf"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let messaging: Messaging | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

// Native OTP state
let nativeVerificationId: string | null = null;
let nativePhoneCodeSentResolver: ((verificationId: string) => void) | null = null;
let nativeVerificationFailedResolver: ((error: string) => void) | null = null;
let nativeListenersRegistered = false;

// Check if Firebase is configured
export const isFirebaseConfigured = (): boolean => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  );
};

// Platform checks
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';

// Initialize Firebase (lazy, singleton)
export const getFirebaseApp = (): FirebaseApp | null => {
  if (!isFirebaseConfigured()) {
    console.warn('⚠️ Firebase not configured');
    return null;
  }
  
  if (!app) {
    try {
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

// Get Firebase Auth instance
export const getFirebaseAuth = (): Auth | null => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  
  if (!auth) {
    try {
      auth = getAuth(firebaseApp);
      console.log('✅ Firebase Auth initialized');
    } catch (error) {
      console.error('❌ Firebase Auth init error:', error);
      return null;
    }
  }
  return auth;
};

// ─── Native Firebase Auth (Android/iOS) ──────────────────────────────

async function registerNativeListeners(): Promise<void> {
  if (nativeListenersRegistered) return;
  
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    
    FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
      console.log('✅ Native: phoneCodeSent, verificationId:', event.verificationId?.substring(0, 20));
      nativeVerificationId = event.verificationId;
      if (nativePhoneCodeSentResolver) {
        nativePhoneCodeSentResolver(event.verificationId);
        nativePhoneCodeSentResolver = null;
      }
    });

    FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      console.error('❌ Native: phoneVerificationFailed:', event.message);
      if (nativeVerificationFailedResolver) {
        nativeVerificationFailedResolver(event.message || 'Phone verification failed');
        nativeVerificationFailedResolver = null;
      }
    });

    // Auto-verification (Android) — user doesn't even type OTP
    FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      console.log('✅ Native: phoneVerificationCompleted (auto-verify)');
      // The credential is auto-applied; the Firebase Web SDK onAuthStateChanged will fire
    });

    nativeListenersRegistered = true;
    console.log('✅ Native Firebase auth listeners registered');
  } catch (error) {
    console.error('❌ Failed to register native listeners:', error);
  }
}

async function sendOtpNative(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    await registerNativeListeners();
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

    console.log('📱 Native: sending OTP to', phoneNumber);

    const resultPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        nativePhoneCodeSentResolver = null;
        nativeVerificationFailedResolver = null;
        console.warn('⏰ Native OTP: timeout');
        resolve({ success: false, error: 'OTP request timed out. Please try again.' });
      }, 30000);

      nativePhoneCodeSentResolver = (_verificationId: string) => {
        clearTimeout(timeout);
        resolve({ success: true });
      };

      nativeVerificationFailedResolver = (errorMsg: string) => {
        clearTimeout(timeout);
        resolve({ success: false, error: errorMsg });
      };
    });

    await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber });

    return await resultPromise;
  } catch (error: any) {
    console.error('❌ Native sendOtp error:', error);
    
    let errorMessage = 'Failed to send OTP';
    const msg = error?.message || error?.code || '';
    if (msg.includes('invalid-phone-number')) {
      errorMessage = 'Invalid phone number format';
    } else if (msg.includes('too-many-requests')) {
      errorMessage = 'Too many attempts. Please try again later.';
    } else if (msg) {
      errorMessage = msg;
    }
    
    return { success: false, error: errorMessage };
  }
}

// Native user info — used across auth layer
export interface NativeAuthUser {
  uid: string;
  phoneNumber: string | null;
}

async function verifyOtpNative(code: string): Promise<{ success: boolean; user?: User; nativeUser?: NativeAuthUser; error?: string }> {
  if (!nativeVerificationId) {
    return { success: false, error: 'No OTP request found. Please request OTP first.' };
  }

  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

    console.log('🔐 Native: verifying OTP...');
    
    // Confirm the verification code using ONLY the native plugin
    await FirebaseAuthentication.confirmVerificationCode({
      verificationId: nativeVerificationId,
      verificationCode: code,
    });

    nativeVerificationId = null;
    console.log('✅ Native: OTP verified');

    // Get user info from native plugin — NO web SDK signInWithCredential
    const nativeUserResult = await FirebaseAuthentication.getCurrentUser();
    const nativeUser: NativeAuthUser = {
      uid: nativeUserResult.user?.uid || '',
      phoneNumber: nativeUserResult.user?.phoneNumber || null,
    };

    console.log('✅ Native user:', nativeUser.uid, nativeUser.phoneNumber);

    // The plugin auto-syncs native auth state to web SDK,
    // so onAuthStateChanged will fire shortly. But we return
    // native user info immediately for profile creation.
    return { success: true, nativeUser };
  } catch (error: any) {
    console.error('❌ Native verifyOtp error:', error);

    let errorMessage = 'Invalid OTP';
    const msg = error?.message || error?.code || '';
    if (msg.includes('invalid-verification-code') || msg.includes('INVALID_CODE')) {
      errorMessage = 'Invalid verification code. Please try again.';
    } else if (msg.includes('code-expired') || msg.includes('SESSION_EXPIRED')) {
      errorMessage = 'OTP has expired. Please request a new one.';
    } else if (msg) {
      errorMessage = msg;
    }

    return { success: false, error: errorMessage };
  }
}

// ─── Web Firebase Auth (reCAPTCHA) ───────────────────────────────────

// Setup invisible reCAPTCHA verifier (web only)
export const setupRecaptcha = (containerId: string = 'recaptcha-container'): RecaptchaVerifier | null => {
  // Skip on native platforms
  if (isNativePlatform()) {
    console.log('ℹ️ Skipping reCAPTCHA setup on native platform');
    return null;
  }

  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.error('❌ Auth not available for reCAPTCHA');
    return null;
  }

  try {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }

    recaptchaVerifier = new RecaptchaVerifier(authInstance, containerId, {
      size: 'invisible',
      callback: () => {
        console.log('✅ reCAPTCHA solved');
      },
      'expired-callback': () => {
        console.log('⚠️ reCAPTCHA expired');
      }
    });

    return recaptchaVerifier;
  } catch (error) {
    console.error('❌ reCAPTCHA setup error:', error);
    return null;
  }
};

function sendOtpWeb(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  return (async () => {
    const authInstance = getFirebaseAuth();
    if (!authInstance) {
      return { success: false, error: 'Firebase Auth not initialized' };
    }

    try {
      if (!recaptchaVerifier) {
        const verifier = setupRecaptcha();
        if (!verifier) {
          return { success: false, error: 'Failed to setup reCAPTCHA' };
        }
      }

      console.log('📱 Web: Sending OTP to:', phoneNumber);
      confirmationResult = await signInWithPhoneNumber(authInstance, phoneNumber, recaptchaVerifier!);
      console.log('✅ Web: OTP sent successfully');

      return { success: true };
    } catch (error: any) {
      console.error('❌ Web sendOtp error:', error);

      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch {}
        recaptchaVerifier = null;
      }

      let errorMessage = 'Failed to send OTP';
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'Invalid phone number format';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'reCAPTCHA verification failed. Please try again.';
      } else if (error.code === 'auth/invalid-app-credential') {
        errorMessage = 'App credential error. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  })();
}

function verifyOtpWeb(code: string): Promise<{ success: boolean; user?: User; error?: string }> {
  return (async () => {
    if (!confirmationResult) {
      return { success: false, error: 'No OTP request found. Please request OTP first.' };
    }

    try {
      console.log('🔐 Web: Verifying OTP...');
      const result = await confirmationResult.confirm(code);
      console.log('✅ Web: OTP verified successfully');

      confirmationResult = null;
      return { success: true, user: result.user };
    } catch (error: any) {
      console.error('❌ Web verifyOtp error:', error);

      let errorMessage = 'Invalid OTP';
      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code. Please try again.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'OTP has expired. Please request a new one.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  })();
}

// ─── Unified public API ──────────────────────────────────────────────

// Send OTP — automatically picks native vs web
export const sendOtp = async (phoneNumber: string): Promise<{ success: boolean; error?: string }> => {
  if (isNativePlatform()) {
    console.log('📱 Using native OTP flow');
    return sendOtpNative(phoneNumber);
  }
  console.log('🌐 Using web OTP flow');
  return sendOtpWeb(phoneNumber);
};

// Verify OTP — automatically picks native vs web
export const verifyOtp = async (code: string): Promise<{ success: boolean; user?: User; nativeUser?: NativeAuthUser; error?: string }> => {
  if (isNativePlatform()) {
    return verifyOtpNative(code);
  }
  return verifyOtpWeb(code);
};

// Get current Firebase user
export const getCurrentUser = (): User | null => {
  const authInstance = getFirebaseAuth();
  return authInstance?.currentUser ?? null;
};

// Listen for auth state changes
export const onFirebaseAuthStateChanged = (callback: (user: User | null) => void): (() => void) => {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.warn('⚠️ Auth not available for state listener');
    return () => {};
  }
  
  return onAuthStateChanged(authInstance, callback);
};

// Sign out
export const signOut = async (): Promise<void> => {
  const authInstance = getFirebaseAuth();
  if (authInstance) {
    await firebaseSignOut(authInstance);
    console.log('✅ Signed out');
  }

  // Also sign out native plugin if on native
  if (isNativePlatform()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch {}
  }
};

// Get Firebase ID token for Supabase
export const getFirebaseIdToken = async (): Promise<string | null> => {
  // On native platforms, use the native plugin to get the token
  if (isNativePlatform()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
      if (result.token) {
        return result.token;
      }
    } catch (error) {
      console.error('❌ Native getIdToken error:', error);
    }
    return null;
  }

  // Web: use Firebase Web SDK
  const authInstance = getFirebaseAuth();
  if (!authInstance) return null;
  
  if (authInstance.currentUser) {
    try {
      return await authInstance.currentUser.getIdToken();
    } catch (error) {
      console.error('❌ Error getting ID token:', error);
      return null;
    }
  }
  
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
      unsubscribe();
      if (user) {
        try {
          const token = await user.getIdToken();
          resolve(token);
        } catch (error) {
          console.error('❌ Error getting ID token:', error);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 5000);
  });
};

// ─── Firebase Messaging (Web Push) ───────────────────────────────────

export const getFirebaseMessaging = (): Messaging | null => {
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

const VAPID_KEY = 'BDSqlP418hdP33VE8JvLy47_9bUruhjq8_a4lwfcTDCFwf8awj9UUgLv9oMFHVPPhMQTveDZuW44NtMyYXqk82RU';

export const getFcmToken = async (): Promise<string | null> => {
  const messagingInstance = getFirebaseMessaging();
  if (!messagingInstance) {
    console.error('❌ Messaging not available');
    return null;
  }

  try {
    let registration: ServiceWorkerRegistration;
    
    try {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      console.log('✅ Service worker registered:', registration.scope);
      await navigator.serviceWorker.ready;
    } catch (swError) {
      console.error('❌ Service worker registration failed:', swError);
      throw swError;
    }

    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('⚠️ No FCM token available');
      return null;
    }
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
