import { supabase } from "@/integrations/supabase/client";

export function normalizePhone(raw?: string | null) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return raw; // assume already E.164
}

/**
 * Ensure a row in public.profiles exists for the current auth user.
 * Creates it if missing, and normalizes the phone to +91XXXXXXXXXX.
 * Returns the up-to-date profile.
 */
export async function ensureProfile() {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) throw new Error("Not authenticated");
  const uid = authData.user.id;

  const authPhone =
    authData.user.phone ??
    (authData.user.user_metadata as any)?.phone_number ??
    (authData.user.user_metadata as any)?.phone ??
    null;

  const normalized = normalizePhone(authPhone ?? "");

  // Try to read existing
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, community, flat_no")
    .eq("id", uid)
    .maybeSingle();

  if (readErr) throw new Error("Failed to read profile");

  if (!existing) {
    // Create minimal profile
    const { data: created, error: upErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: uid,
          full_name: normalized || "User",
          phone: normalized || "",
          community: "other",
          flat_no: "NA",
        },
        { onConflict: "id" }
      )
      .select("id, full_name, phone, community, flat_no")
      .single();
    if (upErr) throw new Error("Failed to create profile");
    return created;
  } else {
    // Update phone if not normalized/missing
    if (normalized && existing.phone !== normalized) {
      const { data: updated, error: updErr } = await supabase
        .from("profiles")
        .update({ phone: normalized })
        .eq("id", uid)
        .select("id, full_name, phone, community, flat_no")
        .single();
      if (updErr) throw new Error("Failed to update phone");
      return updated;
    }
    return existing;
  }
}