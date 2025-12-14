import { supabase } from '@/integrations/supabase/client';
import { auth } from './firebase';

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  console.log("[Firebase Auth] Signing in to Supabase with Firebase token...");
  
  const res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);

  if (res.error) {
    console.error("[Firebase Auth] Error:", res.error.message);
    throw res.error;
  }

  console.log("[Firebase Auth] Success! User:", res.data.user?.id);
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
