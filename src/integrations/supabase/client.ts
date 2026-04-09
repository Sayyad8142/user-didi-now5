// Smart Supabase client with dynamic backend resolution
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  resolveBackendUrl,
  getResolvedUrl,
  clearResolvedUrl,
  BACKEND_CANDIDATES,
} from "@/lib/backendResolver";
import { getFirebaseIdToken } from "@/lib/firebase";

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

// Custom storage that works reliably on mobile
const customStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};

function buildClientOptions() {
  return {
    accessToken: async () => {
      const token = await getFirebaseIdToken();
      if (token) {
        console.debug('[Supabase] Using Firebase ID token for auth');
        return token;
      }
      console.debug('[Supabase] No Firebase token, using anon key');
      return SUPABASE_PUBLISHABLE_KEY;
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  };
}

// ---------- Singleton client ----------

let _client: SupabaseClient<Database> | null = null;
let _currentBaseUrl: string | null = null;

/** Create or recreate the Supabase client for the given base URL */
function createSupabaseClient(baseUrl: string): SupabaseClient<Database> {
  if (_client && _currentBaseUrl === baseUrl) return _client;

  console.info("[Supabase] Creating client →", baseUrl);
  _currentBaseUrl = baseUrl;
  _client = createClient<Database>(baseUrl, SUPABASE_PUBLISHABLE_KEY, buildClientOptions());
  return _client;
}

/**
 * Initialize the Supabase client by resolving the best backend URL.
 * Call this once at app startup (e.g., in App.tsx).
 * Returns true if a working backend was found.
 */
export async function initSupabase(): Promise<boolean> {
  const url = await resolveBackendUrl();
  if (!url) return false;
  createSupabaseClient(url);
  return true;
}

/** Get the current backend base URL the client is connected to */
export function getCurrentBackendUrl(): string | null {
  return _currentBaseUrl;
}

/**
 * Force re-resolve the backend and recreate the client.
 * Use after detecting a network failure on a request.
 */
export async function switchBackend(): Promise<boolean> {
  clearResolvedUrl();
  _client = null;
  _currentBaseUrl = null;
  return initSupabase();
}

// ---------- Proxy export ----------
// All 39+ files import { supabase } statically.
// We use a Proxy so they always reach the live client, even if it's recreated.

const INITIAL_URL = BACKEND_CANDIDATES[0];
// Create a default client immediately so imports don't break before init
createSupabaseClient(INITIAL_URL);

/**
 * The singleton Supabase client.
 * Proxied so that even if the underlying client is recreated (backend switch),
 * all existing references stay valid.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      // Always forward to the live client
      const client = _client!;
      const value = Reflect.get(client, prop, client);
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
    set(_target, prop, value) {
      if (_client) {
        return Reflect.set(_client, prop, value);
      }
      return false;
    },
  }
);

// ---------- Resilient request wrapper ----------

const RETRYABLE_ERRORS = [
  "Failed to fetch",
  "Load failed",
  "NetworkError",
  "TypeError",
  "net::ERR_",
  "DNS",
  "ENOTFOUND",
  "AbortError",
  "signal timed out",
];

function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const msg = typeof error === "string" ? error : (error as any)?.message || String(error);
  return RETRYABLE_ERRORS.some((pattern) => msg.includes(pattern));
}

/**
 * Execute a Supabase operation with automatic backend failover.
 * If the request fails with a network error, re-resolves the backend and retries once.
 *
 * Usage:
 *   const { data } = await withRetry(() => supabase.from('table').select('*'));
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isRetryableError(err)) {
      console.warn("[Supabase] Request failed, switching backend and retrying...", err);
      const ok = await switchBackend();
      if (ok) {
        return fn(); // retry once
      }
    }
    throw err;
  }
}
