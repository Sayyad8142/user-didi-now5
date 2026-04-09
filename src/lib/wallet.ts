/**
 * Wallet data layer — reads wallet data through a backend function.
 *
 * This bypasses the legacy custom wallet API domains, which can fail SSL
 * negotiation in some browsers/webviews and prevent admin-added money from
 * appearing in the app.
 */
import { getFirebaseIdToken, getCurrentUser, getNativeCurrentUser, shouldUseNativeAuth } from '@/lib/firebase';
import { log } from '@/lib/logger';

const WALLET_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wallet-read`
  : '';

const WALLET_FUNCTION_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

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

// ─── Authenticated fetch helper ───────────────────────────────────────

async function getWalletToken(forceRefresh = false): Promise<string> {
  const token = await getFirebaseIdToken(forceRefresh);
  const hasActiveFirebaseUser = shouldUseNativeAuth()
    ? !!(await getNativeCurrentUser())
    : !!getCurrentUser();

  if (!token || !hasActiveFirebaseUser) {
    log.warn('[Wallet] Skipping wallet request — user is not authenticated with Firebase', {
      hasToken: !!token,
      hasActiveFirebaseUser,
    });
    throw new Error('Wallet requires a signed-in account');
  }

  return token;
}

async function walletRead<T>(action: 'get_balance' | 'get_transactions', body: Record<string, unknown> = {}): Promise<T> {
  if (!WALLET_FUNCTION_URL || !WALLET_FUNCTION_KEY) {
    throw new Error('Wallet backend is not configured');
  }

  const request = async (forceRefresh = false) => {
    const token = await getWalletToken(forceRefresh);

    return fetch(WALLET_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: WALLET_FUNCTION_KEY,
        Authorization: `Bearer ${WALLET_FUNCTION_KEY}`,
        'x-firebase-token': token,
      },
      body: JSON.stringify({ action, ...body }),
    });
  };

  let res = await request(false);

  if ((res.status === 401 || res.status === 403) && !res.ok) {
    res = await request(true);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    log.error(`[Wallet] wallet-read ${action} failed`, {
      status: res.status,
      error: data,
    });
    throw new Error(
      (typeof data?.error === 'string' && data.error) ||
      `Wallet request failed: HTTP ${res.status}`
    );
  }

  log.info(`[Wallet] wallet-read ${action} response`, {
    dataType: typeof data,
    isArray: Array.isArray(data),
  });

  return data as T;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetch wallet balance via RPC.
 * Returns the full row shape for compatibility with existing UI.
 */
export async function fetchWalletBalanceRow(): Promise<WalletBalanceRow | null> {
  try {
    const data = await walletRead<{ balance?: number; updated_at?: string; user_id?: string | null }>('get_balance');
    const balanceNum = typeof data?.balance === 'number' ? data.balance : 0;

    log.info('[Wallet] Balance fetched via wallet-read', { balance: balanceNum });

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
 * Fetch wallet transactions via RPC.
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
