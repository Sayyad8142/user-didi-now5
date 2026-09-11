// TEMP diagnostic: inspect external fcm_tokens schema + constraints.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const out: Record<string, unknown> = { external_url: EXTERNAL_SUPABASE_URL };

  // Try a probe select to learn the columns present.
  const probe = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?select=*&limit=3`, {
    headers: {
      apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  out.probe_status = probe.status;
  const rows = await probe.json().catch(() => null);
  if (Array.isArray(rows)) {
    out.row_count = rows.length;
    out.columns = rows[0] ? Object.keys(rows[0]) : [];
    out.sample = rows.map((r: any) => ({
      user_id: r.user_id,
      platform: r.platform ?? null,
      token_preview: typeof r.token === "string" ? `${r.token.slice(0, 10)}…(${r.token.length})` : null,
      updated_at: r.updated_at ?? null,
    }));
  } else {
    out.probe_body = rows;
  }

  // Attempt an on_conflict=user_id upsert with a fake row to see if the
  // constraint exists (rolled back by immediate delete).
  const fakeUser = "00000000-0000-0000-0000-000000000000";
  const up = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ user_id: fakeUser, token: "diag-probe-token" }),
  });
  out.upsert_user_id_status = up.status;
  out.upsert_user_id_body = await up.text();

  await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?token=eq.diag-probe-token`, {
    method: "DELETE",
    headers: {
      apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
