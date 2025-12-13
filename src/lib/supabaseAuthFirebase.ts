import { supabase } from '@/integrations/supabase/client';
import { auth } from './firebase';

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  // Try Firebase provider first (Supabase third-party auth naming can differ)
  let res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);

  // If provider not allowed, try alternate provider keys
  if (res.error?.message?.includes("not allowed") || res.error?.message?.includes("provider")) {
    res = await supabase.auth.signInWithIdToken({
      provider: "firebase-phone",
      token: idToken,
    } as any);
  }

  // If still failing, throw the original error
  if (res.error) throw res.error;

  return { user: res.data.user, session: res.data.session };
}

export async function authenticateWithSupabase() {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error('No Firebase user signed in');
  }
  const idToken = await firebaseUser.getIdToken(true);
  return signInToSupabaseWithFirebaseToken(idToken);
}

export async function signOutFromBoth(): Promise<void> {
  try {
    await auth.signOut();
  } catch (e) {
    console.error('Firebase sign out error:', e);
  }
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Supabase sign out error:', e);
  }
}
