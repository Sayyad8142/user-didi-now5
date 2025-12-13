// @ts-nocheck
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let recaptchaVerifier: any = null;

export function getRecaptchaVerifier(containerId: string): any {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (_) {}
  }
  
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => console.log('reCAPTCHA verified'),
    'expired-callback': () => console.log('reCAPTCHA expired')
  });
  
  return recaptchaVerifier;
}

export function clearRecaptchaVerifier(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (_) {}
    recaptchaVerifier = null;
  }
}

export async function sendFirebaseOTP(phoneNumber: string, containerId: string): Promise<any> {
  const verifier = getRecaptchaVerifier(containerId);
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  return confirmationResult;
}

export async function verifyFirebaseOTP(confirmationResult: any, code: string): Promise<any> {
  const userCredential = await confirmationResult.confirm(code);
  return userCredential;
}

export default app;
