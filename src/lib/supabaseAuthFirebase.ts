import { supabase } from '@/integrations/supabase/client';
import { auth } from './firebase';

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'firebase',
    token: idToken,
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
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
