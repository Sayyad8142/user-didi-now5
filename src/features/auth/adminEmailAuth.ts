import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "team@didisnow.com").toLowerCase();

export async function sendAdminEmailOtp(email: string) {
  email = email.trim().toLowerCase();
  // Always allow sending OTP so Supabase creates the user if needed.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });
  if (error) throw error;
  return true;
}

export async function verifyAdminEmailOtp(email: string, token: string) {
  email = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email", // 6-digit code from Supabase email OTP
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("No user after verification");

  // Upsert profile; mark admin if email matches whitelist
  const { error: upErr } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || "Admin",
      phone: user.phone || "",
      community: "admin",
      flat_no: "admin",
      is_admin: (user.email || "").toLowerCase() === ADMIN_EMAIL,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id", ignoreDuplicates: false });
  if (upErr) console.warn("profile upsert error", upErr);

  return user;
}

export function isWhitelistedAdminEmail(email?: string | null) {
  return (email || "").toLowerCase() === ADMIN_EMAIL;
}