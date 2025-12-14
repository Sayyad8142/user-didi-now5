import { supabase } from "@/integrations/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase";

export function normalizePhone(raw?: string | null) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

/** Wait until Firebase user is authenticated. */
export async function waitForFirebaseUser(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const user = firebaseAuth.currentUser;
    if (user) return user;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Firebase user not ready");
}

/**
 * Ensure a profile row exists for current Firebase user.
 * - Uses Firebase UID as the profile id
 * - Idempotent upsert on id
 * - Normalizes phone to +91XXXXXXXXXX
 * - Returns the profile
 * - Throws with detailed error if RLS/policies block it
 */
export async function ensureProfile() {
  const firebaseUser = await waitForFirebaseUser();
  const uid = firebaseUser.uid;
  const phone = normalizePhone(firebaseUser.phoneNumber ?? "");

  console.log("[ensureProfile] Firebase UID:", uid, "Phone:", phone);

  // Read (no error if missing)
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id")
    .eq("id", uid)
    .maybeSingle();

  if (readErr) {
    console.error("[ensureProfile] Read error:", readErr);
    // continue; we'll attempt upsert which gives clearer RLS errors
  }

  // Create if missing
  if (!existing) {
    console.log("[ensureProfile] Creating new profile for:", uid);
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: uid,
          full_name: phone || "User",
          phone: phone || null,
          community: "other", // Default community to satisfy NOT NULL constraint
          flat_no: "",
        },
        { onConflict: "id" }
      )
      .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id")
      .single();

    if (error) {
      console.error("[ensureProfile] Upsert error:", error);
      // Surface real cause to the UI:
      const msg = error.message || String(error);
      // Common cause: RLS insert policy missing or id != auth.uid()
      throw new Error(
        msg.includes("row-level security")
          ? "RLS blocked profile insert. Ensure insert policy allows Firebase auth.uid()."
          : msg
      );
    }
    console.log("[ensureProfile] Profile created:", data);
    return data!;
  }

  // Update phone if not normalized
  if (phone && existing.phone !== phone) {
    console.log("[ensureProfile] Updating phone for:", uid);
    const { data, error } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", uid)
      .select("id, full_name, phone, community, flat_no, is_admin, building_id, community_id")
      .single();

    if (error) {
      console.error("[ensureProfile] Update error:", error);
      throw new Error(error.message || String(error));
    }
    return data!;
  }

  console.log("[ensureProfile] Profile exists:", existing);
  return existing;
}
