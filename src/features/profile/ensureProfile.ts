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
  const firebaseUid = user.id; // This is the Firebase UID

  const authPhone =
    user.phone ??
    (user.user_metadata as any)?.phone_number ??
    (user.user_metadata as any)?.phone ??
    null;
  const phone = normalizePhone(authPhone ?? "");

  // Read by firebase_uid (not id)
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id, firebase_uid")
    .eq("firebase_uid", firebaseUid)
    .maybeSingle();

  if (readErr) {
    console.error("profiles read error:", readErr);
    // continue; we'll attempt insert which gives clearer RLS errors
  }

  // Create if missing - don't set id, let Supabase auto-generate UUID
  if (!existing) {
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        firebase_uid: firebaseUid,
        full_name: phone || "User",
        phone: phone || "", // Empty string to satisfy NOT NULL constraint
        community: "other", // Default community to satisfy NOT NULL constraint
        flat_no: "",
      })
      .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id, firebase_uid")
      .single();

    if (error) {
      console.error("profiles insert error:", error);
      const msg = error.message || String(error);
      throw new Error(
        msg.includes("row-level security")
          ? "RLS blocked profile insert. Check RLS policy for firebase_uid = auth.uid()::text."
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
      .eq("firebase_uid", firebaseUid)
      .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id, firebase_uid")
      .single();

    if (error) {
      console.error("profiles update error:", error);
      throw new Error(error.message || String(error));
    }
    return data!;
  }

  return existing;
}