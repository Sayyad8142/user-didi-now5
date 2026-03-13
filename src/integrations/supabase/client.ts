import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resolveBackendUrl, clearResolvedUrl, getResolvedUrl } from '@/lib/backendResolver';

const ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const FALLBACK_URL = import.meta.env.VITE_SUPABASE_URL || "https://paywwbuqycovjopryele.supabase.co";

function buildClient(url: string): SupabaseClient {
  return createClient(url, ANON_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
}

let _inner: SupabaseClient = buildClient(FALLBACK_URL);

/** Resolve the best backend URL and (re)create the inner client */
export async function initSupabase(): Promise<boolean> {
  const url = await resolveBackendUrl();
  if (!url) return false;
  _inner = buildClient(url);
  return true;
}

/** Recreate the client with a fresh backend URL (used by withRetry) */
export async function recreateClient(): Promise<void> {
  clearResolvedUrl();
  const url = await resolveBackendUrl();
  if (url) _inner = buildClient(url);
}

/**
 * Proxy so every consumer that imported `supabase` automatically
 * picks up the recreated client after a backend switch.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(_inner, prop, receiver);
  },
});

/** Get the current resolved backend URL */
export function getCurrentBackendUrl(): string {
  return getResolvedUrl() || FALLBACK_URL;
}

/** Switch backend to a specific URL */
export async function switchBackend(url: string): Promise<void> {
  _inner = buildClient(url);
  try { localStorage.setItem('DIDI_BACKEND_URL', url); } catch {}
}

/** Helper: retry a supabase call once after re-resolving the backend */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const msg = err?.message || '';
    const isNetwork = /load failed|networkerror|failed to fetch|dns/i.test(msg);
    if (!isNetwork) throw err;
    console.warn('[withRetry] Network error, re-resolving backend…', msg);
    await recreateClient();
    return fn();
  }
}
