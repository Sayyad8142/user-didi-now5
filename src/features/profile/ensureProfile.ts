import { supabase } from "@/integrations/supabase/client";

export function normalizePhone(raw?: string | null) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

/** Wait until Supabase session exists (handles OTP race). */
export async function waitForSession(timeoutMs = 5000) {
  const start = Date.now();
  // also refresh once to speed up session availability
  await supabase.auth.getSession();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Session not ready after OTP");
}

/**
 * Ensure a profile row exists for current auth user.
 * - Idempotent upsert on id
 * - Normalizes phone to +91XXXXXXXXXX
 * - Returns the profile
 * - Throws with detailed error if RLS/policies block it
 */
export async function ensureProfile() {
  const user = await waitForSession();
  const uid = user.id;

  const authPhone =
    user.phone ??
    (user.user_metadata as any)?.phone_number ??
    (user.user_metadata as any)?.phone ??
    null;
  const phone = normalizePhone(authPhone ?? "");

  // Read (no error if missing)
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, community, flat_no, is_admin")
    .eq("id", uid)
    .maybeSingle();

  if (readErr) {
    console.error("profiles read error:", readErr);
    // continue; we'll attempt upsert which gives clearer RLS errors
  }

  // Create if missing
  if (!existing) {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: uid,
          full_name: phone || "User",
          phone: phone || null,
          community: null,
          flat_no: null,
        },
        { onConflict: "id" }
      )
      .select("id, full_name, phone, community, flat_no, is_admin")
      .single();

    if (error) {
      console.error("profiles upsert error:", error);
      // Surface real cause to the UI:
      const msg = error.message || String(error);
      // Common cause: RLS insert policy missing or id != auth.uid()
      throw new Error(
        msg.includes("row-level security")
          ? "RLS blocked profile insert. Ensure insert policy: auth.uid() = id."
          : msg
      );
    }
    return data!;
  }

  // Update phone if not normalized
  if (phone && existing.phone !== phone) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", uid)
      .select("id, full_name, phone, community, flat_no, is_admin")
      .single();

    if (error) {
      console.error("profiles update error:", error);
      throw new Error(error.message || String(error));
    }
    return data!;
  }

  return existing;
}