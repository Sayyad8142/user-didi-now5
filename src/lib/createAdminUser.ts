import { supabase } from "@/integrations/supabase/client";

export async function createAdminUser(email: string, password: string) {
  const { data, error } = await supabase.functions.invoke('create-admin-user', {
    body: { email, password }
  });

  if (error) throw error;
  return data;
}
