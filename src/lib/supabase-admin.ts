import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  "https://paywwbuqycovjopryele.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Use the SAME storage key as the user app so one login works everywhere
      storageKey: "sb-user-didinow",
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  }
);