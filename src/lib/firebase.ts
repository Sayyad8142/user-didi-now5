// @ts-nocheck
import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDDYRSiCCRslPT_vJ4xhMyEfQkOk_n2eH4",
  authDomain: "didi-now-worker-7b4cb.firebaseapp.com",
  projectId: "didi-now-worker-7b4cb",
  storageBucket: "didi-now-worker-7b4cb.firebasestorage.app",
  messagingSenderId: "993479758920",
  appId: "1:993479758920:web:1550b0d6c69afa10f6747d",
  measurementId: "G-RM3H6RH1E0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let recaptchaVerifier: any = null;

export function getRecaptchaVerifier(containerId: string) {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(
      auth,
      containerId,
      { size: "invisible" }
    );
  }
  return recaptchaVerifier;
}

export function clearRecaptchaVerifier() {
  try {
    recaptchaVerifier?.clear();
  } catch {}
  recaptchaVerifier = null;
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
