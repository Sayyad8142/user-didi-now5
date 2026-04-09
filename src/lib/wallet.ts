/**
 * Wallet data layer — authenticated RPC calls with Firebase ID token.
 *
 * CRITICAL: Wallet RPCs MUST go through the production API domain
 * (api.didisnow.com or api2.didisnow.com) where Firebase JWT translation
 * is configured. The raw Supabase endpoint (paywwbuqycovjopryele.supabase.co)
 * CANNOT verify Firebase RS256 JWTs and will return 401 PGRST301.
 *
 * The backend resolver may fall back to the direct Supabase URL for
 * unauthenticated reads (profiles, config), but wallet MUST NOT use
 * that fallback — it will always fail for authenticated Firebase calls.
 */
import { getFirebaseIdToken } from '@/lib/firebase';
import { PRODUCTION_ANON_KEY, PRODUCTION_API_CANDIDATES } from '@/lib/constants';
import { log } from '@/lib/logger';

const WALLET_TIMEOUT_MS = 6000;

// Cache the working wallet API URL for the session
let _walletApiUrl: string | null = null;

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

// ─── Wallet API URL resolution ───────────────────────────────────────

/**
 * Resolve which production API URL to use for wallet RPCs.
 * Only tries the custom domain candidates (NOT the direct supabase.co URL).
 * Caches the result for the session.
 */
async function resolveWalletApiUrl(): Promise<string> {
  if (_walletApiUrl) return _walletApiUrl;

  for (const url of PRODUCTION_API_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WALLET_TIMEOUT_MS);
      const res = await fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: { apikey: PRODUCTION_ANON_KEY },
        signal: controller.signal,
      });
      clearTimeout(timer);
      // Any HTTP response = server is reachable
      _walletApiUrl = url;
      console.info(`[Wallet] API resolved to: ${url} (HTTP ${res.status})`);
      return url;
    } catch (e: any) {
      console.warn(`[Wallet] API candidate ${url} unreachable:`, e?.message);
    }
  }

  throw new Error(
    '[Wallet] Production API unreachable. Wallet requires api.didisnow.com — ' +
    'the direct Supabase endpoint does not support Firebase JWT auth.'
  );
}

/** Clear cached wallet API URL (call on network failures to force re-resolve) */
export function clearWalletApiCache(): void {
  _walletApiUrl = null;
}

// ─── Authenticated fetch helper (production API only) ────────────────

async function walletRpc<T>(fnName: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = await getFirebaseIdToken();
  const baseUrl = await resolveWalletApiUrl();

  console.info(`[Wallet] RPC ${fnName}`, {
    hasToken: !!token,
    baseUrl: baseUrl,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': PRODUCTION_ANON_KEY,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['Authorization'] = `Bearer ${PRODUCTION_ANON_KEY}`;
    console.warn('[Wallet] No Firebase token — wallet RPC will likely fail');
  }

  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    console.error(`[Wallet] RPC ${fnName} failed`, { status: res.status, baseUrl, err });
    // If we get PGRST301 on a custom domain, the cache might be stale — clear it
    if (err?.code === 'PGRST301') {
      clearWalletApiCache();
    }
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
