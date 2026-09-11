// TEMP diagnostic: inspect external fcm_tokens state + FK reality.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const H = {
  apikey: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const profileId: string | undefined = body?.profile_id;

  const out: Record<string, unknown> = {};

  const latest = await fetch(
    `${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?select=user_id,platform,updated_at&order=updated_at.desc&limit=10`,
    { headers: H },
  );
  out.latest_tokens = await latest.json().catch(() => null);

  if (profileId) {
    const p = await fetch(
      `${EXTERNAL_SUPABASE_URL}/rest/v1/profiles?select=id,firebase_uid,phone&id=eq.${profileId}`,
      { headers: H },
    );
    out.profile = await p.json().catch(() => null);

    const t = await fetch(
      `${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?select=user_id,platform,updated_at&user_id=eq.${profileId}`,
      { headers: H },
    );
    out.existing_token_rows = await t.json().catch(() => null);

    // Does an auth.users row exist for this profile id? (admin API)
    const au = await fetch(`${EXTERNAL_SUPABASE_URL}/auth/v1/admin/users/${profileId}`, { headers: H });
    out.auth_user_status = au.status;
    const auBody = await au.json().catch(() => null);
    out.auth_user_id = (auBody as any)?.id ?? null;

    // Real insert attempt with a probe token to capture the exact failure.
    const up = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?on_conflict=user_id`, {
      method: "POST",
      headers: { ...H, prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: profileId, token: "diag-probe-token", platform: "ios" }),
    });
    out.upsert_status = up.status;
    out.upsert_body = await up.text();

    await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/fcm_tokens?token=eq.diag-probe-token`, {
      method: "DELETE",
      headers: H,
    });
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
