/**
 * Wallet data layer — uses authenticated RPC calls with Firebase ID token.
 *
 * The main Supabase client uses only the anon key (no Firebase session),
 * so direct table queries to user_wallets are blocked by RLS.
 *
 * Instead, we call SECURITY DEFINER RPCs:
 *   - get_my_wallet_balance()      → returns balance_inr (numeric)
 *   - get_my_wallet_transactions() → returns array of transaction rows
 *
 * These RPCs use auth.uid() internally, so we must send the Firebase
 * ID token in the Authorization header.
 */
import { getFirebaseIdToken } from '@/lib/firebase';
import { getCurrentBackendUrl, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';

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

// ─── Authenticated fetch helper ──────────────────────────────────────

async function walletRpc<T>(fnName: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = await getFirebaseIdToken();
  const baseUrl = getCurrentBackendUrl();

  console.info(`[Wallet] RPC ${fnName}`, {
    hasToken: !!token,
    baseUrl: baseUrl?.substring(0, 30),
  });

  if (!baseUrl) {
    throw new Error('[Wallet] No backend URL resolved yet');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_PUBLISHABLE_KEY,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Without Firebase token, auth.uid() will be NULL and RLS will block.
    // Still attempt the call — it may work if the RPC has public access.
    headers['Authorization'] = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`;
    console.warn('[Wallet] No Firebase token — RPC may return empty/blocked result');
  }

  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    console.error(`[Wallet] RPC ${fnName} failed`, { status: res.status, err });
    throw new Error(err.message || `Wallet RPC ${fnName} failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  console.info(`[Wallet] RPC ${fnName} response`, {
    dataType: typeof data,
    isArray: Array.isArray(data),
    preview: Array.isArray(data) ? `${data.length} rows` : data,
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
    const balance = await walletRpc<number | null>('get_my_wallet_balance');
    const balanceNum = typeof balance === 'number' ? balance : 0;

    console.info('[Wallet] Balance fetched via RPC', { balance: balanceNum });

    // RPC returns just the balance number; construct a compatible row
    return {
      user_id: 'rpc', // placeholder — not used by UI
      balance_inr: balanceNum,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Wallet] fetchWalletBalanceRow error:', err);
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
    const rows = await walletRpc<WalletTransactionRow[]>('get_my_wallet_transactions', {
      p_limit: limit,
    });

    if (!Array.isArray(rows)) {
      console.warn('[Wallet] Transactions RPC returned non-array:', rows);
      return [];
    }

    return rows;
  } catch (err) {
    console.error('[Wallet] fetchWalletTransactions error:', err);
    throw err;
  }
}
