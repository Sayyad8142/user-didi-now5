import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function serve(req: Request): Promise<Response> {
  console.log('Function called with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log('Creating supabase client...');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false }
    });

    console.log('Parsing request body...');
    const body = await req.json().catch((err) => {
      console.error('JSON parse error:', err);
      return null;
    }) as { filename: string; contentType: string; base64: string } | null;

    if (!body || !body.filename || !body.base64) {
      console.log('Invalid payload:', body);
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('Checking admin status...');
    
    // Get auth header and extract JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header');
      return new Response(JSON.stringify({ error: 'No authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Create client with the user's JWT for admin check
    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const { data: isAdmin, error: adminErr } = await userSupabase.rpc('is_admin');
    console.log('Admin check result:', { isAdmin, adminErr });
    
    if (adminErr) {
      console.error('is_admin check failed', adminErr);
      return new Response(JSON.stringify({ error: adminErr.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (!isAdmin) {
      console.log('User is not admin');
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const name = body.filename.replace(/\s+/g, '_');
    const path = `w_${Date.now()}_${name}`;
    console.log('Upload path:', path);

    // Decode base64 → bytes
    console.log('Decoding base64...');
    const binary = atob(body.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    console.log('Decoded bytes length:', bytes.length);

    console.log('Uploading to storage...');
    const { error: upErr } = await supabase.storage
      .from('worker-photos')
      .upload(path, bytes, {
        contentType: body.contentType || 'application/octet-stream',
        upsert: false,
        cacheControl: '31536000, public, immutable',
      });

    if (upErr) {
      console.error('upload error', upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('Getting public URL...');
    const { data: pub } = supabase.storage.from('worker-photos').getPublicUrl(path);
    console.log('Upload successful, URL:', pub.publicUrl);

    return new Response(JSON.stringify({ url: pub.publicUrl, path }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected error: ' + String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// Default export for Supabase Edge Functions runtime
export default serve;