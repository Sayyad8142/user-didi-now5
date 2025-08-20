import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || '',
        },
      },
    });

    const body = await req.json().catch(() => null) as
      | { filename: string; contentType: string; base64: string }
      | null;

    if (!body || !body.filename || !body.base64) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Verify admin via DB function
    const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
    if (adminErr) {
      console.error('is_admin check failed', adminErr);
      return new Response(JSON.stringify({ error: adminErr.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const name = body.filename.replace(/\s+/g, '_');
    const path = `w_${Date.now()}_${name}`;

    // Decode base64 → bytes
    const binary = atob(body.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { error: upErr } = await supabase.storage
      .from('worker-photos')
      .upload(path, bytes, {
        contentType: body.contentType || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      });

    if (upErr) {
      console.error('upload error', upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { data: pub } = supabase.storage.from('worker-photos').getPublicUrl(path);

    return new Response(JSON.stringify({ url: pub.publicUrl, path }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('unexpected', e);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// Default export for Supabase Edge Functions runtime
export default serve;