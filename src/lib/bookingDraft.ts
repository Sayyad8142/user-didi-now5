/**
 * Temporary booking selections kept while the customer visits Account
 * Settings to fix flat details. sessionStorage only, 30-minute expiry,
 * read once. Only plain selections are stored — never prices, payment
 * data, tokens or booking IDs — so pricing/availability are always
 * recomputed by the screen and the server on return.
 */

const PREFIX = 'booking_draft:';
export const DRAFT_TTL_MS = 30 * 60 * 1000;

const ALLOWED_KEYS = new Set([
  'selectedTasks', 'dishIntensity', 'bathroomCount', 'hasGlassPartition',
  'selectedDate', 'selectedTime', 'bookingType',
]);

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): Store | null {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

export function saveBookingDraft(screenKey: string, draft: Record<string, unknown>, s: Store | null = store(), now = Date.now()) {
  if (!s) return;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) if (ALLOWED_KEYS.has(k)) clean[k] = v;
  try { s.setItem(PREFIX + screenKey, JSON.stringify({ savedAt: now, data: clean })); } catch { /* ignore */ }
}

/** Returns the draft once and deletes it. Null if missing, expired or corrupt. */
export function takeBookingDraft<T = Record<string, unknown>>(screenKey: string, s: Store | null = store(), now = Date.now()): Partial<T> | null {
  if (!s) return null;
  const key = PREFIX + screenKey;
  try {
    const raw = s.getItem(key);
    s.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) return null;
    return parsed.data as Partial<T>;
  } catch { return null; }
}

export function clearBookingDraft(screenKey: string, s: Store | null = store()) {
  try { s?.removeItem(PREFIX + screenKey); } catch { /* ignore */ }
}
