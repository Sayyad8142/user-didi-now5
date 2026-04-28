// Firebase Configuration for Phone Auth and Web Push
// NOTE: OTP delivery is now handled by Twilio Verify (edge functions twilio-send-otp /
// twilio-verify-otp). Firebase remains the identity layer — we mint a Firebase
// Custom Token server-side and exchange it via signInWithCustomToken so the rest of
// the app (firebase_uid, x-firebase-token, profiles linkage) works unchanged.
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithPhoneNumber,
  signInWithCustomToken,
  RecaptchaVerifier,
  ConfirmationResult,
  onAuthStateChanged,
  User,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { getMessaging, Messaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

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
export const isWeb = (): boolean => !Capacitor.isNativePlatform();

// Whether native Firebase phone auth plugin is available and safe to call.
// Currently only Android has the plugin implemented; iOS will get it later.
let _nativeAuthAvailable: boolean | null = null;

export const isNativeAuthAvailable = async (): Promise<boolean> => {
  if (_nativeAuthAvailable !== null) return _nativeAuthAvailable;
  if (!isNativePlatform() || !isAndroid()) {
    _nativeAuthAvailable = false;
    console.log(`[OTP-AUDIT] isNativeAuthAvailable=false (platform=${Capacitor.getPlatform()}, native=${isNativePlatform()})`);
    return false;
  }
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    // Verify plugin is actually registered with Capacitor bridge (not the JS stub)
    // Capacitor.isPluginAvailable returns false when the Android plugin class isn't compiled in.
    const registered = Capacitor.isPluginAvailable('FirebaseAuthentication');
    if (!registered) {
      console.error('❌ [OTP-AUDIT] FirebaseAuthentication plugin NOT registered in Android bridge. APK was built without `npx cap sync android`.');
      _nativeAuthAvailable = false;
      return false;
    }
    // Smoke-test: if plugin is a stub this throws
    await FirebaseAuthentication.getCurrentUser();
    _nativeAuthAvailable = true;
    console.log('✅ [OTP-AUDIT] Native FirebaseAuthentication plugin available and registered');
  } catch (e: any) {
    console.error('❌ [OTP-AUDIT] Native FirebaseAuthentication not available:', e?.message);
    _nativeAuthAvailable = false;
  }
  return _nativeAuthAvailable;
};

// Custom error returned when Android APK lacks the native plugin.
// We refuse to silently fall back to web reCAPTCHA — that opens an external
// browser/Custom Tab which breaks the in-app OTP UX.
export const NATIVE_PLUGIN_MISSING_ERROR =
  'Native Firebase Auth plugin is not available in this build. Please rebuild APK after `npx cap sync android`.';

// Synchronous best-guess: Android native = true, everything else = false.
// Use this for UI decisions (e.g. hiding reCAPTCHA container).
export const shouldUseNativeAuth = (): boolean => isNativePlatform() && isAndroid();

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

// Fully purge reCAPTCHA artifacts that Google injects into <body> (badge,
// challenge iframes, script-injected divs). Without this, calling render()
// a second time after a failed/stale OTP attempt throws and we surface the
// generic "Failed to setup reCAPTCHA" error to the user.
const purgeRecaptchaDom = (containerId: string) => {
  try {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    // Google injects these directly into <body> — they are NOT inside our container
    document.querySelectorAll('.grecaptcha-badge').forEach((n) => n.remove());
    document.querySelectorAll('iframe[src*="recaptcha"]').forEach((n) => n.remove());
    document.querySelectorAll('iframe[title*="recaptcha" i]').forEach((n) => n.remove());

    // Reset the global grecaptcha singleton so a fresh widget id can be issued
    const w = window as any;
    if (w.___grecaptcha_cfg) {
      try { delete w.___grecaptcha_cfg; } catch { w.___grecaptcha_cfg = undefined; }
    }
  } catch (e) {
    console.warn('purgeRecaptchaDom warning:', e);
  }
};

// Setup invisible reCAPTCHA verifier — works on ALL platforms (web + Capacitor webview)
export const setupRecaptcha = async (containerId: string = 'recaptcha-container'): Promise<RecaptchaVerifier | null> => {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.error('❌ Auth not available for reCAPTCHA');
    return null;
  }

  // Clear any existing verifier
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch {}
    recaptchaVerifier = null;
  }

  // Remove stale DOM/global artifacts from previous attempts BEFORE we look up the container
  purgeRecaptchaDom(containerId);

  // Wait one tick to let React re-render the container (it may have been removed
  // by a previous tab switch and just re-mounted on this attempt).
  await new Promise((r) => setTimeout(r, 0));

  const tryCreate = async (): Promise<RecaptchaVerifier | null> => {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('❌ reCAPTCHA container element not found:', containerId);
      return null;
    }

    container.innerHTML = '';
    console.log('[auth] setupRecaptcha start — container found:', containerId);

    const verifier = new RecaptchaVerifier(authInstance, containerId, {
      size: 'invisible',
      callback: () => {
        console.log('✅ reCAPTCHA solved');
      },
      'expired-callback': () => {
        console.log('⚠️ reCAPTCHA expired, will re-create on next send');
        if (recaptchaVerifier) {
          try { recaptchaVerifier.clear(); } catch {}
          recaptchaVerifier = null;
        }
      },
    });

    await verifier.render();
    return verifier;
  };

  try {
    recaptchaVerifier = await tryCreate();
    if (recaptchaVerifier) {
      console.log('✅ reCAPTCHA verifier created and rendered');
      return recaptchaVerifier;
    }
    return null;
  } catch (error) {
    console.warn('⚠️ reCAPTCHA first attempt failed, retrying after full purge:', error);
    // Full purge + one retry handles the case where Google left a half-initialized widget
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch {}
      recaptchaVerifier = null;
    }
    purgeRecaptchaDom(containerId);
    await new Promise((r) => setTimeout(r, 50));

    try {
      recaptchaVerifier = await tryCreate();
      if (recaptchaVerifier) {
        console.log('✅ reCAPTCHA verifier created on retry');
        return recaptchaVerifier;
      }
    } catch (retryErr) {
      console.error('❌ reCAPTCHA setup error (retry failed):', retryErr);
    }

    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch {}
      recaptchaVerifier = null;
    }
    return null;
  }
};

async function sendOtpWeb(
  phoneNumber: string,
  containerId: string = 'recaptcha-container'
): Promise<{ success: boolean; error?: string }> {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    return { success: false, error: 'Firebase Auth not initialized' };
  }

  try {
    console.log('[auth] sendOtpWeb: ensuring fresh reCAPTCHA verifier for', containerId);
    const verifier = await setupRecaptcha(containerId);
    if (!verifier) {
      return { success: false, error: 'Failed to setup reCAPTCHA. Please refresh and try again.' };
    }

    console.log('🌐 Web: Sending OTP to:', phoneNumber);
    confirmationResult = await signInWithPhoneNumber(authInstance, phoneNumber, verifier);
    console.log('✅ Web: OTP sent successfully');

    return { success: true };
  } catch (error: any) {
    console.error('❌ Web sendOtp error:', error?.code, error?.message);

    // Clear stale verifier so next attempt rebuilds
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

// Send OTP — Android native MUST use plugin, web/iOS uses web reCAPTCHA.
// On Android native, we refuse to silently fall back to web reCAPTCHA because
// that opens a Custom Tab/external browser which breaks the in-app OTP UX.
export const sendOtp = async (
  phoneNumber: string,
  containerId: string = 'recaptcha-container'
): Promise<{ success: boolean; error?: string }> => {
  const platform = Capacitor.getPlatform();
  const native = isNativePlatform();
  const useNative = await isNativeAuthAvailable();
  console.log(`[OTP-AUDIT] sendOtp — platform=${platform}, isNative=${native}, useNative=${useNative}, phone=${phoneNumber}`);

  if (useNative) {
    console.log('[OTP-AUDIT] → Using NATIVE OTP flow (Android plugin) — no reCAPTCHA');
    return sendOtpNative(phoneNumber);
  }

  // Hard guard: Android native APK must NEVER fall through to web reCAPTCHA.
  if (native && isAndroid()) {
    console.error('[OTP-AUDIT] ❌ Android native build but plugin unavailable. Refusing web reCAPTCHA fallback.');
    return { success: false, error: NATIVE_PLUGIN_MISSING_ERROR };
  }

  console.log(`[OTP-AUDIT] → Using WEB OTP flow (reCAPTCHA) — platform=${platform}`);
  return sendOtpWeb(phoneNumber, containerId);
};

// Verify OTP — matches the flow chosen by sendOtp
export const verifyOtp = async (code: string): Promise<{ success: boolean; user?: User; nativeUser?: NativeAuthUser; error?: string }> => {
  const platform = Capacitor.getPlatform();
  const native = isNativePlatform();
  const useNative = await isNativeAuthAvailable();
  console.log(`[OTP-AUDIT] verifyOtp — platform=${platform}, isNative=${native}, useNative=${useNative}, hasNativeId=${!!nativeVerificationId}, hasWebCR=${!!confirmationResult}`);

  if (useNative) {
    console.log('[OTP-AUDIT] → Using NATIVE verify flow (Android plugin)');
    return verifyOtpNative(code);
  }

  if (native && isAndroid()) {
    console.error('[OTP-AUDIT] ❌ Android native verify but plugin unavailable.');
    return { success: false, error: NATIVE_PLUGIN_MISSING_ERROR };
  }

  console.log(`[OTP-AUDIT] → Using WEB verify flow — platform=${platform}`);
  return verifyOtpWeb(code);
};

// Get current Firebase user (web SDK only — use getNativeCurrentUser for native)
export const getCurrentUser = (): User | null => {
  const authInstance = getFirebaseAuth();
  return authInstance?.currentUser ?? null;
};

// Get current user from native plugin (async) — only on Android where plugin works
export const getNativeCurrentUser = async (): Promise<NativeAuthUser | null> => {
  if (!shouldUseNativeAuth()) return null;
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.getCurrentUser();
    if (result.user) {
      console.log('📱 Native getCurrentUser:', result.user.uid, result.user.phoneNumber);
      return { uid: result.user.uid, phoneNumber: result.user.phoneNumber || null };
    }
    console.log('📱 Native getCurrentUser: no user');
    return null;
  } catch (error) {
    console.error('❌ Native getCurrentUser error:', error);
    return null;
  }
};

// Listen for auth state changes (web SDK)
export const onFirebaseAuthStateChanged = (callback: (user: User | null) => void): (() => void) => {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.warn('⚠️ Auth not available for state listener');
    return () => {};
  }
  
  return onAuthStateChanged(authInstance, callback);
};

// Sign out — native plugin on Android only, web SDK everywhere
export const signOut = async (): Promise<void> => {
  if (shouldUseNativeAuth()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
      console.log('✅ Native: signed out');
    } catch (error) {
      console.error('❌ Native signOut error:', error);
    }
  }

  // Also sign out web SDK (harmless no-op if not initialized on native)
  const authInstance = getFirebaseAuth();
  if (authInstance) {
    await firebaseSignOut(authInstance);
    console.log('✅ Web SDK: signed out');
  }
};

// Get Firebase ID token for Supabase
export const getFirebaseIdToken = async (forceRefresh = false): Promise<string | null> => {
  // On Android native, use the native plugin to get the token
  if (shouldUseNativeAuth()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      for (let attempt = 0; attempt < 8; attempt++) {
        const result = await FirebaseAuthentication.getIdToken({ forceRefresh: forceRefresh || attempt > 0 });
        if (result.token) {
          if (attempt > 0) {
            console.log(`✅ Native getIdToken succeeded on retry #${attempt}`);
          }
          return result.token;
        }

        if (attempt < 7) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
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
      return await authInstance.currentUser.getIdToken(forceRefresh);
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
