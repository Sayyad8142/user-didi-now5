import type { SupabaseClient } from "@supabase/supabase-js";
import {
  supabase as typedSupabase,
  initSupabase,
  getCurrentBackendUrl,
  switchBackend,
  withRetry,
} from "./client";

export const supabase = typedSupabase as unknown as SupabaseClient<any>;

export { initSupabase, getCurrentBackendUrl, switchBackend, withRetry };
