import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "./phone";

/** Wait until auth session is present (handles OTP race). */
export async function waitForSession(ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Session not ready");
}

/** Idempotent: creates profile if missing; normalizes phone; never throws on initial read miss. */
export async function ensureProfile() {
  const user = await waitForSession();
  const uid = user.id;
  const authPhone =
    user.phone ??
    (user.user_metadata as any)?.phone_number ??
    (user.user_metadata as any)?.phone ?? null;
  const phone = normalizePhone(authPhone ?? "");

  // Try to read existing; if it errors, continue (we'll upsert).
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, full_name, phone, community, flat_no, is_admin")
    .eq("id", uid)
    .maybeSingle();

  if (!existing) {
    // Insert minimal profile (idempotent upsert)
    const { data: created, error: upErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: uid,
          full_name: phone || "User",
          phone: phone || "",
          community: "other",
          flat_no: "NA",
        },
        { onConflict: "id" }
      )
      .select("id, full_name, phone, community, flat_no, is_admin")
      .single();

    if (upErr) throw new Error("Could not create profile");
    return created;
  }

  // Update phone if not normalized
  if (phone && existing.phone !== phone) {
    const { data: updated, error: updErr } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", uid)
      .select("id, full_name, phone, community, flat_no, is_admin")
      .single();
    if (updErr) throw new Error("Could not update profile phone");
    return updated;
  }

  return existing;
}