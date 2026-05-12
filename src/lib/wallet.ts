/**
 * Wallet data layer — reads wallet data through a production edge function.
 *
 * Uses the same production backend (api.didisnow.com) as the rest of the app.
 * The wallet-read edge function must be deployed to the production Supabase project.
 */
import { getFirebaseIdToken, getCurrentUser, getNativeCurrentUser, shouldUseNativeAuth } from '@/lib/firebase';
import { log } from '@/lib/logger';
import { resolveBackendUrl, getResolvedUrl } from '@/lib/backendResolver';
import { PRODUCTION_ANON_KEY } from '@/lib/constants';

// ─── Types ───────────────────────────────────────────────────────────

export interface WalletBalanceRow {
  user_id: string;
  balance_inr: number;
  updated_at: string;
}

export interface WalletTransactionRow {
  id: string;
  user_id: string;
  booking_id: string | null;
  type: 'credit' | 'debit';
  amount_inr: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Query keys ──────────────────────────────────────────────────────

export const walletBalanceQueryKey = (userId: string | null | undefined) =>
  ['wallet-balance', userId] as const;

export const walletTransactionsQueryKey = (userId: string | null | undefined) =>
  ['wallet-transactions', userId] as const;

// ─── Diagnostics helper (exported for DiagnosticsPanel) ──────────────

/** Returns the wallet endpoint URL currently being used */
export function getWalletEndpointUrl(): string {
  const resolved = getResolvedUrl();
  if (resolved) return `${resolved}/functions/v1/wallet-read`;
  return '(resolving…)';
}

// ─── Authenticated fetch helper ───────────────────────────────────────

async function getWalletToken(forceRefresh = false): Promise<string> {
  const token = await getFirebaseIdToken(forceRefresh);

  // Since the Twilio migration, OTP signs in via the Firebase Web SDK on every
  // platform (signInWithCustomToken). On native Android, the legacy native plugin
  // (FirebaseAuthentication.getCurrentUser) returns null for these sessions —
  // so checking only the native plugin would incorrectly mark the user as
  // signed-out and the wallet would silently return 0.
  // Accept EITHER a Web SDK user OR a legacy native user.
  const webUser = !!getCurrentUser();
  const nativeUser = shouldUseNativeAuth() ? !!(await getNativeCurrentUser()) : false;
  const hasActiveFirebaseUser = webUser || nativeUser;

  if (!token || !hasActiveFirebaseUser) {
    log.warn('[Wallet] Skipping wallet request — user is not authenticated with Firebase', {
      hasToken: !!token,
      webUser,
      nativeUser,
    });
    throw new Error('Wallet requires a signed-in account');
  }

  return token;
}

async function walletRead<T>(action: 'get_balance' | 'get_transactions', body: Record<string, unknown> = {}): Promise<T> {
  // Resolve the production backend URL (same as rest of the app)
  const backendUrl = await resolveBackendUrl();
  if (!backendUrl) {
    throw new Error('No reachable backend — wallet request failed');
  }

  const functionUrl = `${backendUrl}/functions/v1/wallet-read`;

  log.info(`[Wallet] walletRead ${action}`, {
    endpoint: functionUrl,
    backendUrl,
  });

  const request = async (forceRefresh = false) => {
    const token = await getWalletToken(forceRefresh);

    return fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        'x-firebase-token': token,
      },
      body: JSON.stringify({ action, ...body }),
    });
  };

  let res = await request(false);

  if ((res.status === 401 || res.status === 403) && !res.ok) {
    log.warn(`[Wallet] ${action} got ${res.status}, retrying with fresh token…`);
    res = await request(true);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    log.error(`[Wallet] wallet-read ${action} failed`, {
      status: res.status,
      endpoint: functionUrl,
      error: data,
    });
    throw new Error(
      (typeof data?.error === 'string' && data.error) ||
      `Wallet request failed: HTTP ${res.status}`
    );
  }

  log.info(`[Wallet] wallet-read ${action} success`, {
    endpoint: functionUrl,
    dataKeys: Object.keys(data),
  });

  return data as T;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetch wallet balance via the production wallet-read edge function.
 */
export async function fetchWalletBalanceRow(): Promise<WalletBalanceRow | null> {
  try {
    const data = await walletRead<{ balance?: number; updated_at?: string; user_id?: string | null }>('get_balance');
    const balanceNum = typeof data?.balance === 'number' ? data.balance : 0;

    log.info('[Wallet] Balance fetched', { balance: balanceNum });

    return {
      user_id: data?.user_id || 'wallet-read',
      balance_inr: balanceNum,
      updated_at: data?.updated_at || new Date().toISOString(),
    };
  } catch (err) {
    log.error('[Wallet] fetchWalletBalanceRow error:', err);
    throw err;
  }
}

/**
 * Fetch wallet balance as a plain number.
 */
export async function fetchWalletBalanceValue(): Promise<number> {
  try {
    const row = await fetchWalletBalanceRow();
    return row?.balance_inr ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch wallet transactions via the production wallet-read edge function.
 */
export async function fetchWalletTransactions(limit = 50): Promise<WalletTransactionRow[]> {
  try {
    const data = await walletRead<{ transactions?: Array<Record<string, unknown>> }>('get_transactions', { limit });
    const rows = Array.isArray(data?.transactions) ? data.transactions : [];

    return rows.map((row) => ({
      id: String(row.id ?? `${row.created_at ?? Date.now()}-${Math.random()}`),
      user_id: String(row.user_id ?? 'wallet-read'),
      booking_id: typeof row.booking_id === 'string' ? row.booking_id : null,
      type: row.type === 'debit' ? 'debit' : 'credit',
      amount_inr: Number(row.amount_inr ?? row.amount ?? 0),
      reason: typeof row.reason === 'string' ? row.reason : null,
      reference_type: typeof row.reference_type === 'string' ? row.reference_type : null,
      reference_id: typeof row.reference_id === 'string' ? row.reference_id : null,
      notes:
        typeof row.notes === 'string'
          ? row.notes
          : typeof row.description === 'string'
            ? row.description
            : null,
      created_at:
        typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString(),
    }));
  } catch (err) {
    log.error('[Wallet] fetchWalletTransactions error:', err);
    throw err;
  }
}
