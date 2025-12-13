import { supabase } from '@/integrations/supabase/client';
import { auth } from './firebase';

/**
 * Signs into Supabase using a Firebase ID token.
 * This uses Supabase's third-party auth provider feature.
 */
export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'firebase',
    token: idToken,
  });

  if (error) {
    console.error('Supabase signInWithIdToken error:', error);
    throw error;
  }

  return data;
}

/**
 * Gets the current Firebase user's ID token and signs into Supabase.
 * Call this after Firebase OTP verification is successful.
 */
export async function authenticateWithSupabase(): Promise<{
  user: any;
  session: any;
}> {
  const firebaseUser = auth.currentUser;
  
  if (!firebaseUser) {
    throw new Error('No Firebase user signed in');
  }

  // Get the Firebase ID token
  const idToken = await firebaseUser.getIdToken(/* forceRefresh */ true);
  
  // Sign into Supabase with the Firebase token
  const { user, session } = await signInToSupabaseWithFirebaseToken(idToken);
  
  return { user, session };
}

/**
 * Signs out from both Firebase and Supabase
 */
export async function signOutFromBoth() {
  try {
    // Sign out from Firebase
    await auth.signOut();
  } catch (e) {
    console.error('Firebase sign out error:', e);
  }
  
  try {
    // Sign out from Supabase
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Supabase sign out error:', e);
  }
}
