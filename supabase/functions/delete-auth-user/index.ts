import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Firebase ID token and extract user info
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; phone?: string } | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing environment variables');
      return new Response(JSON.stringify({ error: "Server configuration error" }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { 
      auth: { persistSession: false } 
    });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!token) {
      console.error('Missing authorization token');
      return new Response(JSON.stringify({ error: "Missing token" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser) {
      console.error('Invalid Firebase token');
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const firebaseUid = firebaseUser.uid;
    console.log(`Deleting account for Firebase UID: ${firebaseUid}`);

    // Find the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', firebaseUid)
      .maybeSingle();

    if (profileError) {
      console.error('Error finding profile:', profileError);
      return new Response(JSON.stringify({ error: "Failed to find profile" }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!profile?.id) {
      console.log('No profile found for this Firebase UID');
      return new Response(JSON.stringify({ success: true, message: "No profile to delete" }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const profileId = profile.id;
    console.log(`Found profile ID: ${profileId}, deleting user data...`);

    // Get user's booking IDs first (needed for FK cleanup)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', profileId);
    
    const bookingIds = bookings?.map(b => b.id) || [];
    console.log(`Found ${bookingIds.length} bookings to clean up`);

    // Delete in correct order to respect FK constraints:
    
    // 1. Delete notification_queue rows referencing user's bookings
    if (bookingIds.length > 0) {
      const { error: nqErr } = await supabase
        .from('notification_queue')
        .delete()
        .in('booking_id', bookingIds);
      if (nqErr) console.warn('notification_queue cleanup:', nqErr.message);
    }

    // 2. Delete support_threads for this user
    // Note: support_threads.user_id references auth.users, but we'll clean by profile ID pattern
    const { error: stErr } = await supabase
      .from('support_threads')
      .delete()
      .eq('user_id', profileId);
    if (stErr) console.warn('support_threads cleanup:', stErr.message);

    // 3. Delete support_messages (cascade from threads should handle, but be safe)
    // support_messages has FK to support_threads with CASCADE

    // 4. Delete worker_ratings for user's bookings
    if (bookingIds.length > 0) {
      const { error: wrErr } = await supabase
        .from('worker_ratings')
        .delete()
        .in('booking_id', bookingIds);
      if (wrErr) console.warn('worker_ratings cleanup:', wrErr.message);
    }

    // 5. Delete worker_reviews for user's bookings
    if (bookingIds.length > 0) {
      const { error: wrvErr } = await supabase
        .from('worker_reviews')
        .delete()
        .in('booking_id', bookingIds);
      if (wrvErr) console.warn('worker_reviews cleanup:', wrvErr.message);
    }

    // 6. Delete rtc_calls for user's bookings
    if (bookingIds.length > 0) {
      const { error: rtcErr } = await supabase
        .from('rtc_calls')
        .delete()
        .in('booking_id', bookingIds);
      if (rtcErr) console.warn('rtc_calls cleanup:', rtcErr.message);
    }

    // 7. Delete booking_messages (has CASCADE but be explicit)
    if (bookingIds.length > 0) {
      const { error: bmErr } = await supabase
        .from('booking_messages')
        .delete()
        .in('booking_id', bookingIds);
      if (bmErr) console.warn('booking_messages cleanup:', bmErr.message);
    }

    // 8. Delete booking_events (has CASCADE)
    if (bookingIds.length > 0) {
      const { error: beErr } = await supabase
        .from('booking_events')
        .delete()
        .in('booking_id', bookingIds);
      if (beErr) console.warn('booking_events cleanup:', beErr.message);
    }

    // 9. Delete booking_status_history (has CASCADE)
    if (bookingIds.length > 0) {
      const { error: bshErr } = await supabase
        .from('booking_status_history')
        .delete()
        .in('booking_id', bookingIds);
      if (bshErr) console.warn('booking_status_history cleanup:', bshErr.message);
    }

    // 10. Delete booking_requests (has CASCADE)
    if (bookingIds.length > 0) {
      const { error: brErr } = await supabase
        .from('booking_requests')
        .delete()
        .in('booking_id', bookingIds);
      if (brErr) console.warn('booking_requests cleanup:', brErr.message);
    }

    // 11. Delete booking_assignments (has CASCADE)
    if (bookingIds.length > 0) {
      const { error: baErr } = await supabase
        .from('booking_assignments')
        .delete()
        .in('booking_id', bookingIds);
      if (baErr) console.warn('booking_assignments cleanup:', baErr.message);
    }

    // 12. Delete assignments (has CASCADE)
    if (bookingIds.length > 0) {
      const { error: aErr } = await supabase
        .from('assignments')
        .delete()
        .in('booking_id', bookingIds);
      if (aErr) console.warn('assignments cleanup:', aErr.message);
    }

    // 13. Delete notification_logs for user's bookings
    if (bookingIds.length > 0) {
      const { error: nlErr } = await supabase
        .from('notification_logs')
        .delete()
        .in('booking_id', bookingIds);
      if (nlErr) console.warn('notification_logs cleanup:', nlErr.message);
    }

    // 14. Delete bookings
    const { error: bookingsErr } = await supabase
      .from('bookings')
      .delete()
      .eq('user_id', profileId);
    if (bookingsErr) {
      console.error('Failed to delete bookings:', bookingsErr);
      return new Response(JSON.stringify({ error: bookingsErr.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 15. Delete feedback (has CASCADE to profiles)
    const { error: fbErr } = await supabase
      .from('feedback')
      .delete()
      .eq('user_id', profileId);
    if (fbErr) console.warn('feedback cleanup:', fbErr.message);

    // 16. Delete user_fcm_tokens (has CASCADE to profiles)
    const { error: fcmErr } = await supabase
      .from('user_fcm_tokens')
      .delete()
      .eq('user_id', profileId);
    if (fcmErr) console.warn('user_fcm_tokens cleanup:', fcmErr.message);

    // 17. Delete device_tokens
    const { error: dtErr } = await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', profileId);
    if (dtErr) console.warn('device_tokens cleanup:', dtErr.message);

    // 18. Finally delete the profile
    const { error: profileDelErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profileId);
    
    if (profileDelErr) {
      console.error('Failed to delete profile:', profileDelErr);
      return new Response(JSON.stringify({ error: profileDelErr.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Successfully deleted profile: ${profileId}`);

    // Try to delete Supabase auth user if it exists
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(profileId);
    if (authDelErr) {
      console.warn('Could not delete Supabase auth user (may not exist):', authDelErr.message);
    }

    console.log(`Account deletion completed for Firebase UID: ${firebaseUid}`);
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('Server error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
