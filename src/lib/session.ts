import { isGuest, clearGuest } from './guest';
import { supabase } from '@/integrations/supabase/client';

export const hasAppAccess = async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session || isGuest();
};

// Clear guest flag when a real auth session appears
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) clearGuest();
});
