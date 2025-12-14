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
 * - Uses firebase_uid column to link Firebase UID to profile
 * - UUID is auto-generated for the profile id
 * - Normalizes phone to +91XXXXXXXXXX
 * - Returns the profile
 * - Throws with detailed error if RLS/policies block it
 */
export async function ensureProfile() {
  const firebaseUser = await waitForFirebaseUser();
  const uid = firebaseUser.uid;
  const phone = normalizePhone(firebaseUser.phoneNumber ?? "");

  console.log("[AUTH] ensureProfile - Firebase UID:", uid, "Phone:", phone);

  // Read by firebase_uid (no error if missing)
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id, firebase_uid, full_name, phone, community, flat_no, is_admin, building_id, community_id")
    .eq("firebase_uid", uid)
    .maybeSingle();

  if (readErr) {
    console.error("[AUTH] ensureProfile - Read error:", readErr);
    // continue; we'll attempt insert which gives clearer RLS errors
  }

  // Create if missing
  if (!existing) {
    console.log("[AUTH] ensureProfile - Creating new profile for Firebase UID:", uid);
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        firebase_uid: uid,
        full_name: phone || "User",
        phone: phone || "",
        community: "other", // Default community to satisfy NOT NULL constraint
        flat_no: "",
      })
      .select("id, firebase_uid, full_name, phone, community, flat_no, is_admin, building_id, community_id")
      .single();

    if (error) {
      console.error("[AUTH] ensureProfile - Insert error:", error);
      // Surface real cause to the UI:
      const msg = error.message || String(error);
      // Common cause: RLS insert policy missing or firebase_uid != auth.uid()
      throw new Error(
        msg.includes("row-level security")
          ? "RLS blocked profile insert. Ensure insert policy allows Firebase auth.uid()."
          : msg
      );
    }
    console.log("[AUTH] ensureProfile - Profile created, UUID:", data?.id, "firebase_uid:", data?.firebase_uid);
    return data!;
  }

  if (phone && existing.phone !== phone) {
    console.log("[AUTH] ensureProfile - Updating phone for Firebase UID:", uid);
    const { data, error } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("firebase_uid", uid)
      .select("id, firebase_uid, full_name, phone, community, flat_no, is_admin, building_id, community_id")
      .single();

    if (error) {
      console.error("[AUTH] ensureProfile - Update error:", error);
      throw new Error(error.message || String(error));
    }
    return data!;
  }

  console.log("[AUTH] ensureProfile - Profile exists, UUID:", existing?.id, "firebase_uid:", existing?.firebase_uid);
  return existing;
}
