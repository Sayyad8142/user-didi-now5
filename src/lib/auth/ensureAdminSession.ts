import { supabase } from "@/integrations/supabase/client";

export async function ensureAdminSession() {
  // Try current session
  let { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  // Try refresh once
  const { data, error } = await supabase.auth.refreshSession();
  if (data?.session) return data.session;

  throw Object.assign(new Error("AUTH_EXPIRED"), { code: "AUTH_EXPIRED", cause: error });
}