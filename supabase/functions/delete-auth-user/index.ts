import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Verify caller is logged-in (JWT from the app)
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!token) {
      console.error('Missing authorization token');
      return new Response("Missing token", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    // Get user from token using anon key client
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { 
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      console.error('Invalid token or user not found:', userErr);
      return new Response("Invalid token", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const userId = userData.user.id;
    console.log(`Attempting to delete user: ${userId}`);

    // Delete auth user using service role
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('Failed to delete user:', delErr);
      return new Response(`Delete failed: ${delErr.message}`, { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log(`Successfully deleted user: ${userId}`);
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