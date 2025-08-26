import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizeDriveUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('drive.google.com')) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)\//);
      if (m && m[1]) {
        return `https://drive.google.com/uc?export=download&id=${m[1]}`;
      }
      // also support open?id=
      const id = u.searchParams.get('id');
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return url;
  } catch {
    return url;
  }
}

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
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const body = await req.json().catch(() => null) as
      | { sourceUrl: string; kind: 'privacy' | 'terms' }
      | null;

    if (!body || !body.sourceUrl || !body.kind) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Validate admin with user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userSupabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: isAdmin, error: adminErr } = await userSupabase.rpc('is_admin');
    if (adminErr) {
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

    // Resolve and fetch the URL
    const resolvedUrl = normalizeDriveUrl(body.sourceUrl);
    const resp = await fetch(resolvedUrl, { redirect: 'follow' });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Download failed (${resp.status})` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const contentType = resp.headers.get('content-type') || 'application/pdf';
    const buf = new Uint8Array(await resp.arrayBuffer());

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const path = `${body.kind}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('app-pdfs')
      .upload(path, buf, { contentType, upsert: true, cacheControl: '3600' });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { data: pub } = supabase.storage.from('app-pdfs').getPublicUrl(path);
    return new Response(JSON.stringify({ url: pub.publicUrl, path, contentType }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unexpected error: ' + String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export default serve;
