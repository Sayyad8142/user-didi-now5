// Ensure a profiles row exists for the authenticated Firebase user.
// Verifies the Firebase ID token, then upserts/links a profile row using
// the service role (bypasses RLS safely, scoped to the verified uid).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

type Body = {
  full_name?: string;
  community?: string;
  community_id?: string | null;
  building_id?: string | null;
  flat_id?: string | null;
  flat_no?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw.startsWith("+") ? raw : `+${d}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Missing Firebase token" }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const firebaseUid = fb.uid;

    const body = (await req.json().catch(() => ({}))) as Body;
    const phone = normalizePhone(fb.phone || "");

    const url = Deno.env.get("SUPABASE_URL");
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !srk) {
      console.error("[ensure-profile] Missing env");
      return json({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(url, srk, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Already linked by firebase_uid
    const { data: byUid, error: byUidErr } = await admin
      .from("profiles")
      .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id, firebase_uid")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (byUidErr) {
      console.error("[ensure-profile] lookup by uid failed", byUidErr);
      return json({ error: "Profile lookup failed" }, 500);
    }
    if (byUid) return json({ profile: byUid, created: false });

    // 2) Try to link an existing profile by phone
    if (phone) {
      const { data: byPhone } = await admin
        .from("profiles")
        .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id, firebase_uid")
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byPhone) {
        const { data: linked, error: linkErr } = await admin
          .from("profiles")
          .update({ firebase_uid: firebaseUid, phone })
          .eq("id", byPhone.id)
          .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id, firebase_uid")
          .single();
        if (linkErr) {
          console.error("[ensure-profile] link by phone failed", linkErr);
          return json({ error: "Profile link failed" }, 500);
        }
        return json({ profile: linked, created: false, linked: true });
      }
    }

    // 3) Insert a new profile
    const insertRow: Record<string, unknown> = {
      firebase_uid: firebaseUid,
      phone: phone || "",
      full_name: body.full_name || phone || "User",
      community: body.community || "other",
      flat_no: body.flat_no || "",
    };
    if (body.community_id !== undefined) insertRow.community_id = body.community_id;
    if (body.building_id !== undefined) insertRow.building_id = body.building_id;
    if (body.flat_id !== undefined) insertRow.flat_id = body.flat_id;

    const { data: created, error: insErr } = await admin
      .from("profiles")
      .insert(insertRow)
      .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id, firebase_uid")
      .single();

    if (insErr) {
      // Race: someone inserted between lookup and insert
      if ((insErr as any).code === "23505") {
        const { data: again } = await admin
          .from("profiles")
          .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id, firebase_uid")
          .eq("firebase_uid", firebaseUid)
          .maybeSingle();
        if (again) return json({ profile: again, created: false });
      }
      console.error("[ensure-profile] insert failed", insErr);
      return json({ error: insErr.message || "Profile insert failed" }, 500);
    }

    return json({ profile: created, created: true });
  } catch (e: any) {
    console.error("[ensure-profile] error", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
