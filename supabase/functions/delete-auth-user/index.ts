import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Firebase ID token and extract user info
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; phone?: string } | null> {
  try {
    // Decode the token to get the Firebase project ID
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const projectId = payload.aud;
    
    // Verify the token with Google's public keys
    const response = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${Deno.env.get("FIREBASE_API_KEY") || ""}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    
    if (!response.ok) {
      console.error('Firebase token verification failed:', await response.text());
      return null;
    }
    
    const data = await response.json();
    if (!data.users || data.users.length === 0) {
      return null;
    }
    
    const user = data.users[0];
    return {
      uid: user.localId,
      phone: user.phoneNumber,
    };
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing environment variables');
      return new Response("Server configuration error", { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { 
      auth: { persistSession: false } 
    });

    // Get Firebase ID token from Authorization header
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!token) {
      console.error('Missing authorization token');
      return new Response("Missing token", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    // Verify Firebase token
    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser) {
      console.error('Invalid Firebase token');
      return new Response("Invalid token", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const firebaseUid = firebaseUser.uid;
    console.log(`Attempting to delete user with Firebase UID: ${firebaseUid}`);

    // Find the profile by firebase_uid to get the Supabase user ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', firebaseUid)
      .maybeSingle();

    if (profileError) {
      console.error('Error finding profile:', profileError);
    }

    // If we found a profile with a linked Supabase auth user, delete it
    if (profile?.id) {
      console.log(`Found profile ID: ${profile.id}, attempting to delete Supabase auth user`);
      
      // Try to delete the Supabase auth user (may not exist if using Firebase-only auth)
      const { error: delErr } = await supabase.auth.admin.deleteUser(profile.id);
      if (delErr) {
        // Log but don't fail - the user might only exist in Firebase
        console.warn('Could not delete Supabase auth user (may not exist):', delErr.message);
      } else {
        console.log(`Successfully deleted Supabase auth user: ${profile.id}`);
      }
    } else {
      console.log('No Supabase auth user found for this Firebase UID - Firebase-only user');
    }

    // Note: Firebase user deletion should be handled client-side or via Firebase Admin SDK
    // The client will sign out from Firebase after this call succeeds

    console.log(`Account deletion process completed for Firebase UID: ${firebaseUid}`);
    return new Response("OK", { 
      status: 200, 
      headers: corsHeaders 
    });
  } catch (e) {
    console.error('Server error:', e);
    return new Response(`Server error: ${e}`, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
