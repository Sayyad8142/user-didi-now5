// Firebase Configuration for Phone Auth and Web Push
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  Auth,
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  ConfirmationResult,
  onAuthStateChanged,
  PhoneAuthProvider,
  signInWithCredential,
  User,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { getMessaging, Messaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

// Lazy-loaded native plugin — only available on Android
let _nativeAuth: typeof import('@capacitor-firebase/authentication').FirebaseAuthentication | null = null;
const getNativeAuth = async () => {
  if (!_nativeAuth) {
    const mod = await import('@capacitor-firebase/authentication');
    _nativeAuth = mod.FirebaseAuthentication;
  }
  return _nativeAuth;
};

// Firebase config (hardcoded as per project requirements)
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

// Setup invisible reCAPTCHA verifier
export const setupRecaptcha = (containerId: string = 'recaptcha-container'): RecaptchaVerifier | null => {
  const native = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const useNativePhoneAuth = native && platform === 'android';

  console.log('[Auth] setupRecaptcha called', {
    containerId,
    native,
    platform,
    useNativePhoneAuth,
  });

  if (useNativePhoneAuth) {
    console.log('[Auth] Skipping reCAPTCHA setup on native runtime');
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

// Check if running on native platform
const getPhoneAuthRuntime = () => {
  const native = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  return {
    native,
    platform,
    useNativePhoneAuth: native && platform === 'android',
  };
};

// Native verification ID storage for Capacitor flow
let nativeVerificationId: string | null = null;

// Send OTP to phone number
export const sendOtp = async (phoneNumber: string): Promise<{ success: boolean; error?: string }> => {
  const runtime = getPhoneAuthRuntime();

  try {
    console.log('📱 Sending OTP to:', phoneNumber);
    console.log('[Auth] Capacitor.isNativePlatform()', runtime.native);
    console.log('[Auth] Capacitor.getPlatform()', runtime.platform);

    if (runtime.useNativePhoneAuth) {
      console.log('USING NATIVE PHONE AUTH');
      nativeVerificationId = null;
      const NativeAuth = await getNativeAuth();
      await NativeAuth.removeAllListeners();

      const verificationIdPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Native OTP send timed out'));
        }, 30000);

        const cleanup = async () => {
          clearTimeout(timeout);
          await NativeAuth.removeAllListeners();
        };

        NativeAuth.addListener('phoneCodeSent', async (event) => {
          console.log('[Auth] Native phoneCodeSent event received');
          nativeVerificationId = event.verificationId;
          await cleanup();
          resolve(event.verificationId);
        });

        NativeAuth.addListener('phoneVerificationCompleted', async () => {
          console.log('[Auth] Native phoneVerificationCompleted event received');
          nativeVerificationId = 'auto-verified';
          await cleanup();
          resolve('auto-verified');
        });

        NativeAuth.addListener('phoneVerificationFailed', async (event: any) => {
          console.error('[Auth] Native phoneVerificationFailed event received:', event);
          nativeVerificationId = null;
          await cleanup();
          reject(new Error(event?.message || event?.code || 'Native phone verification failed'));
        });
      });

      await NativeAuth.signInWithPhoneNumber({ phoneNumber });
      const verificationId = await verificationIdPromise;

      if (verificationId === 'auto-verified') {
        console.log('✅ Phone auto-verified');
        return { success: true };
      }

      if (!verificationId) {
        return { success: false, error: 'Failed to get verification ID' };
      }

      console.log('✅ Native OTP sent successfully');
      return { success: true };
    }

    console.log('USING WEB PHONE AUTH');

    const authInstance = getFirebaseAuth();
    if (!authInstance) {
      return { success: false, error: 'Firebase Auth not initialized' };
    }

    if (!recaptchaVerifier) {
      console.log('[Auth] Creating reCAPTCHA verifier for web phone auth');
      const verifier = setupRecaptcha();
      if (!verifier) {
        return { success: false, error: 'Failed to setup reCAPTCHA' };
      }
    }

    console.log('[Auth] Calling signInWithPhoneNumber via Firebase Web SDK');
    confirmationResult = await signInWithPhoneNumber(authInstance, phoneNumber, recaptchaVerifier!);
    console.log('✅ OTP sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Send OTP error:', error);

    if (!runtime.useNativePhoneAuth && recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch {}
      recaptchaVerifier = null;
    }

    let errorMessage = 'Failed to send OTP';
    if (error.code === 'auth/invalid-phone-number') {
      errorMessage = 'Invalid phone number format';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many attempts. Please try again later.';
    } else if (error.code === 'auth/captcha-check-failed' || error.code === 'auth/invalid-app-credential') {
      errorMessage = 'Verification failed. Please try again.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, error: errorMessage };
  }
};

// Verify OTP code
export const verifyOtp = async (code: string): Promise<{ success: boolean; user?: User; error?: string }> => {
  try {
    console.log('🔐 Verifying OTP...');

    if (Capacitor.isNativePlatform() && nativeVerificationId) {
      if (nativeVerificationId === 'auto-verified') {
        // Already auto-verified, get current user from web SDK
        const authInstance = getFirebaseAuth();
        const user = authInstance?.currentUser ?? null;
        nativeVerificationId = null;
        return { success: true, user: user ?? undefined };
      }

      // Use native confirmVerificationCode then sync to web SDK
      const NativeAuth = await getNativeAuth();
      const result = await NativeAuth.confirmVerificationCode({
        verificationId: nativeVerificationId,
        verificationCode: code,
      });
      nativeVerificationId = null;

      // The native confirmVerificationCode signs the user in natively.
      // We need to sync to the web SDK. Get a fresh ID token from native and use it.
      // On Capacitor, the native Firebase SDK and web SDK share auth state 
      // when using the same google-services.json / GoogleService-Info.plist.
      // Just wait a moment for auth state to sync.
      const authInstance = getFirebaseAuth();
      if (authInstance) {
        // Wait for onAuthStateChanged to fire with the signed-in user
        const user = await new Promise<User | null>((resolve) => {
          if (authInstance.currentUser) {
            resolve(authInstance.currentUser);
            return;
          }
          const unsub = onAuthStateChanged(authInstance, (u) => {
            unsub();
            resolve(u);
          });
          setTimeout(() => { unsub(); resolve(null); }, 5000);
        });
        if (user) {
          console.log('✅ Native OTP verified & web SDK synced');
          return { success: true, user };
        }
      }

      console.log('✅ Native OTP verified');
      return { success: true };
    }

    // Web flow
    if (!confirmationResult) {
      return { success: false, error: 'No OTP request found. Please request OTP first.' };
    }

    const result = await confirmationResult.confirm(code);
    console.log('✅ OTP verified successfully');
    confirmationResult = null;
    return { success: true, user: result.user };
  } catch (error: any) {
    console.error('❌ Verify OTP error:', error);

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
};

// Get Firebase ID token for Supabase (waits for auth state)
export const getFirebaseIdToken = async (): Promise<string | null> => {
  const authInstance = getFirebaseAuth();
  if (!authInstance) return null;
  
  // If user is already available, return token immediately
  if (authInstance.currentUser) {
    try {
      return await authInstance.currentUser.getIdToken();
    } catch (error) {
      console.error('❌ Error getting ID token:', error);
      return null;
    }
  }
  
  // Wait for auth state to be determined (handles async initialization)
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
    
    // Timeout after 5 seconds to prevent hanging
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 5000);
  });
};

// Get Firebase Messaging instance
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

// VAPID key for web push
const VAPID_KEY = 'BDSqlP418hdP33VE8JvLy47_9bUruhjq8_a4lwfcTDCFwf8awj9UUgLv9oMFHVPPhMQTveDZuW44NtMyYXqk82RU';

// Get FCM token for web push
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
  
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
      tag: payload.data?.booking_id ? `booking-${payload.data.booking_id}` : 'general',
    });
  }
};
