/**
 * Smart Backend Resolver
 * Tests multiple backend URLs and selects the first reachable one.
 * Caches the result in localStorage for fast subsequent launches.
 * Supports auto-switch on failure.
 */

const STORAGE_KEY = "DIDI_BACKEND_URL";
const PROBE_VERSION_KEY = "DIDI_BACKEND_PROBE_V";
const PROBE_VERSION = "2"; // bump to invalidate stale cached URLs from old probe
const TIMEOUT_MS = 3000;

import { PRODUCTION_ANON_KEY, BACKEND_CANDIDATES } from '@/lib/constants';
export { BACKEND_CANDIDATES };

const ANON_KEY = PRODUCTION_ANON_KEY;

export type BackendTestResult = {
  url: string;
  ok: boolean;
  ms: number;
  error?: string;
};

/**
 * Test a single URL for reachability AND that anon REST queries work.
 * We probe `app_config` (publicly readable per RLS) so we only accept a
 * backend that can actually serve queries with the anon key. This prevents
 * picking a host that returns 401 "Invalid API key" on the bare /rest/v1/
 * endpoint (which would later break Firebase-JWT-translated queries).
 */
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
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { url, ok: false, ms, error: `HTTP ${res.status}` };
    }
    return { url, ok: true, ms };
  } catch (e: any) {
    const ms = Math.round(performance.now() - t0);
    return { url, ok: false, ms, error: e?.name === "AbortError" ? "Timeout" : e?.message || "Network error" };
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
      console.info(`[BackendResolver] Cached URL works: ${cached} (${result.ms}ms)`);
      return cached;
    }
    console.warn(`[BackendResolver] Cached URL failed: ${cached}, trying candidates...`);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // 2. Try each candidate in order
  for (const url of BACKEND_CANDIDATES) {
    if (url === cached) continue; // Already tried
    const result = await testUrl(url);
    if (result.ok) {
      _resolvedUrl = url;
      try { localStorage.setItem(STORAGE_KEY, url); } catch {}
      console.info(`[BackendResolver] Resolved to: ${url} (${result.ms}ms)`);
      return url;
    }
    console.warn(`[BackendResolver] ${url} failed: ${result.error || "HTTP error"} (${result.ms}ms)`);
  }

  console.error("[BackendResolver] All backend candidates failed!");
  return null;
}
