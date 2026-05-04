/**
 * Smart Backend Resolver
 * Tests multiple backend URLs and selects the first reachable one.
 * Caches the result in localStorage for fast subsequent launches.
 * Supports auto-switch on failure.
 */

const STORAGE_KEY = "DIDI_BACKEND_URL";
const TIMEOUT_MS = 1000; // Reduced from 3000ms — fail fast on broken SSL endpoints

import { PRODUCTION_ANON_KEY, BACKEND_CANDIDATES } from '@/lib/constants';
export { BACKEND_CANDIDATES };

const ANON_KEY = PRODUCTION_ANON_KEY;

export type BackendTestResult = {
  url: string;
  ok: boolean;
  ms: number;
  error?: string;
};

/** Test a single URL via real health check (app_config select).
 * Falls back to /rest/v1/ root if health check itself errors with HTTP status. */
export async function testUrl(url: string, timeoutMs = TIMEOUT_MS): Promise<BackendTestResult> {
  const t0 = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/rest/v1/app_config?select=id&limit=1`, {
      method: "GET",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - t0);
    // 2xx = healthy; 4xx still means server reachable (treat as ok for fallback)
    if (res.ok || res.status === 401 || res.status === 403) {
      return { url, ok: true, ms };
    }
    return { url, ok: false, ms, error: `HTTP ${res.status}` };
  } catch (e: any) {
    const ms = Math.round(performance.now() - t0);
    const errName = e?.name === "AbortError" ? "Timeout" : e?.message || "Network error";
    // Likely SSL/cipher mismatch shows as "Failed to fetch" / TypeError
    const isSslOrNetwork = /failed to fetch|load failed|ssl|cipher|network/i.test(errName);
    if (isSslOrNetwork) {
      console.error(`[BackendResolver] SSL/network error on ${url}: ${errName} (${ms}ms)`);
    }
    return { url, ok: false, ms, error: errName };
  }
}


/** Test all candidates and return results */
export async function testAllCandidates(timeoutMs = TIMEOUT_MS): Promise<BackendTestResult[]> {
  return Promise.all(BACKEND_CANDIDATES.map((url) => testUrl(url, timeoutMs)));
}

let _resolvedUrl: string | null = null;
let _resolvePromise: Promise<string | null> | null = null;

/** Get the currently resolved URL (synchronous, may be null if not resolved yet) */
export function getResolvedUrl(): string | null {
  return _resolvedUrl;
}

/** Clear the cached backend URL (used on failure to trigger re-resolution) */
export function clearResolvedUrl(): void {
  _resolvedUrl = null;
  _resolvePromise = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Resolve the best reachable backend URL.
 * 1. Try cached URL from localStorage first
 * 2. Fall through ordered candidates
 * Returns null if ALL candidates fail.
 */
export async function resolveBackendUrl(): Promise<string | null> {
  // Return cached if already resolved in this session
  if (_resolvedUrl) return _resolvedUrl;

  // Deduplicate concurrent calls
  if (_resolvePromise) return _resolvePromise;

  _resolvePromise = _doResolve();
  const result = await _resolvePromise;
  _resolvePromise = null;
  return result;
}

async function _doResolve(): Promise<string | null> {
  // 1. Try the cached URL first
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {}

  if (cached) {
    const result = await testUrl(cached);
    if (result.ok) {
      _resolvedUrl = cached;
      console.info(`[BackendResolver] ✅ Using cached backend: ${cached} (${result.ms}ms)`);
      return cached;
    }
    console.warn(`[BackendResolver] Cached URL failed: ${cached} → ${result.error}, trying candidates...`);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // 2. Try each candidate in order
  const failures: string[] = [];
  for (const url of BACKEND_CANDIDATES) {
    if (url === cached) continue; // Already tried
    const result = await testUrl(url);
    if (result.ok) {
      _resolvedUrl = url;
      try { localStorage.setItem(STORAGE_KEY, url); } catch {}
      console.info(`[BackendResolver] ✅ Resolved to: ${url} (${result.ms}ms)`);
      return url;
    }
    failures.push(`${url}: ${result.error || "HTTP error"} (${result.ms}ms)`);
    console.warn(`[BackendResolver] ❌ ${url} failed: ${result.error || "HTTP error"} (${result.ms}ms)`);
  }

  console.error("[BackendResolver] 🚨 All backend candidates failed!\n" + failures.join("\n"));
  return null;
}

