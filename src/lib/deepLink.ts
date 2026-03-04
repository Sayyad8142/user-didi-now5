// ============================================================================
// Deep Link Router — normalizes deep link URLs and navigates safely
// ============================================================================

/** Whitelisted route patterns (regex). Order matters — first match wins. */
const ALLOWED_ROUTES: RegExp[] = [
  /^\/booking\/[a-f0-9-]{36}$/,     // /booking/:uuid
  /^\/bookings\/[a-f0-9-]{36}$/,    // /bookings/:uuid (alias)
  /^\/bookings$/,                    // /bookings list
  /^\/home$/,
  /^\/wallet$/,
  /^\/support$/,
  /^\/offers$/,
  /^\/profile$/,
  /^\/faqs$/,
];

const KNOWN_HOSTS = ['app.didisnow.com', 'didisnow.com'];

/**
 * Normalise any deep link input into an internal path like "/booking/abc-123"
 * Accepts:
 *   - "/booking/abc"
 *   - "https://app.didisnow.com/booking/abc"
 *   - "didinow://booking/abc"
 *   - { deep_link: "/booking/abc" }  (extracts string first)
 * Returns null if input is invalid or route not whitelisted.
 */
export function normalizeDeepLink(input: unknown): string | null {
  let raw: string | null = null;

  if (typeof input === 'string') {
    raw = input.trim();
  } else if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    raw = (typeof obj.deep_link === 'string' ? obj.deep_link :
           typeof obj.link === 'string' ? obj.link :
           typeof obj.url === 'string' ? obj.url : null);
    if (raw) raw = raw.trim();
  }

  if (!raw) return null;

  let path: string;

  // Custom scheme  didinow://booking/abc  →  /booking/abc
  if (raw.startsWith('didinow://')) {
    path = '/' + raw.replace('didinow://', '');
  }
  // Full URL  https://app.didisnow.com/booking/abc
  else if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      if (!KNOWN_HOSTS.includes(url.hostname)) return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  // Already a path
  else if (raw.startsWith('/')) {
    path = raw;
  } else {
    return null;
  }

  // Strip trailing slash
  path = path.replace(/\/+$/, '') || '/';

  // Strip query / hash
  path = path.split('?')[0].split('#')[0];

  // Security: only allow whitelisted routes
  if (!ALLOWED_ROUTES.some(re => re.test(path))) return null;

  // Alias: /bookings/:id  →  /bookings  (the bookings page handles the id via state)
  // We keep the path as-is; the app routes must handle it.

  return path;
}

const DL_KEY = '__dl_handled_at';

/**
 * Navigate to a deep link path. Guards against double-navigation within 2 s.
 */
export function navigateDeepLink(
  path: string,
  navigate: (p: string) => void,
): void {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(DL_KEY) || '0');
  if (now - last < 2000) {
    console.log('[DeepLink] skipped — handled <2 s ago');
    return;
  }
  sessionStorage.setItem(DL_KEY, String(now));
  console.log('[DeepLink] navigating →', path);
  navigate(path);
}
