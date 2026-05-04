/**
 * Shared constants for the Didi Now user app.
 * Single source of truth for keys and URLs used across modules.
 */

/** Production Supabase project anon key (publishable — safe in client code) */
export const PRODUCTION_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o';

/** Production API domains that support Firebase JWT translation */
export const PRODUCTION_API_CANDIDATES = [
  'https://api.didisnow.com',
  'https://api2.didisnow.com',
] as const;

/** Direct Supabase URL (fallback for public reads only) */
export const DIRECT_SUPABASE_URL = 'https://paywwbuqycovjopryele.supabase.co';

/** All backend candidates in priority order */
export const BACKEND_CANDIDATES = [
  ...PRODUCTION_API_CANDIDATES,
  DIRECT_SUPABASE_URL,
] as const;
