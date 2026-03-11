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
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

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
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.error('❌ Auth not available for reCAPTCHA');
    return null;
  }

  try {
    // Clear existing verifier
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
const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

// Native verification ID storage for Capacitor flow
let nativeVerificationId: string | null = null;

// Send OTP to phone number
export const sendOtp = async (phoneNumber: string): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('📱 Sending OTP to:', phoneNumber);

    if (isNativePlatform()) {
      // Native flow: uses native Firebase SDK, no reCAPTCHA needed
      console.log('📱 Using native Firebase Auth for OTP');
      
      // Listen for verificationId via event
      const verificationIdPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('OTP send timed out')), 30000);
        FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
          clearTimeout(timeout);
          resolve(event.verificationId);
        });
        // Handle auto-verification on Android (instant verify)
        FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
          clearTimeout(timeout);
          // Auto-verified, sign in with the web SDK credential
          const authInstance = getFirebaseAuth();
          if (authInstance && event.verificationId && event.verificationCode) {
            const credential = PhoneAuthProvider.credential(event.verificationId, event.verificationCode);
            await signInWithCredential(authInstance, credential);
          }
          resolve('auto-verified');
        });
      });

      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber });
      nativeVerificationId = await verificationIdPromise;
      
      // Clean up listeners
      await FirebaseAuthentication.removeAllListeners();
      
      if (nativeVerificationId === 'auto-verified') {
        // Phone was auto-verified, user is already signed in
        console.log('✅ Phone auto-verified');
        return { success: true };
      }
      
      if (!nativeVerificationId) {
        return { success: false, error: 'Failed to get verification ID' };
      }
      console.log('✅ Native OTP sent successfully');
      return { success: true };
    }

    // Web flow: uses reCAPTCHA
    const authInstance = getFirebaseAuth();
    if (!authInstance) {
      return { success: false, error: 'Firebase Auth not initialized' };
    }

    if (!recaptchaVerifier) {
      const verifier = setupRecaptcha();
      if (!verifier) {
        return { success: false, error: 'Failed to setup reCAPTCHA' };
      }
    }

    confirmationResult = await signInWithPhoneNumber(authInstance, phoneNumber, recaptchaVerifier!);
    console.log('✅ OTP sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Send OTP error:', error);

    // Reset reCAPTCHA on error (web only)
    if (!isNativePlatform() && recaptchaVerifier) {
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
  if (!confirmationResult) {
    return { success: false, error: 'No OTP request found. Please request OTP first.' };
  }

  try {
    console.log('🔐 Verifying OTP...');
    const result = await confirmationResult.confirm(code);
    console.log('✅ OTP verified successfully');
    
    // Clear confirmation result after successful verification
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
