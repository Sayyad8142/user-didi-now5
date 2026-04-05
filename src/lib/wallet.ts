import { supabase } from '@/integrations/supabase/client';

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

export interface WalletFetchContext {
  authUserId?: string | null;
  profileId?: string | null;
  source: string;
  walletUserId: string;
}

export const walletBalanceQueryKey = (userId: string | null | undefined) => ['wallet-balance', userId] as const;
export const walletTransactionsQueryKey = (userId: string | null | undefined) => ['wallet-transactions', userId] as const;

function logWalletIdentity(context: WalletFetchContext) {
  return {
    authUserId: context.authUserId ?? null,
    profileId: context.profileId ?? null,
    walletUserId: context.walletUserId,
    source: context.source,
  };
}

export async function fetchWalletBalanceRow(context: WalletFetchContext): Promise<WalletBalanceRow | null> {
  const identity = logWalletIdentity(context);

  console.info('[Wallet] Balance query request', {
    ...identity,
    table: 'public.user_wallets',
    column: 'balance_inr',
    filter: `user_id=eq.${context.walletUserId}`,
  });

  const { data, error, status, statusText } = await supabase
    .from('user_wallets')
    .select('user_id, balance_inr, updated_at')
    .eq('user_id', context.walletUserId)
    .maybeSingle();

  console.info('[Wallet] Balance query response', {
    ...identity,
    status,
    statusText,
    error,
    row: data,
    rowIsNull: data === null,
    balanceReturned: data?.balance_inr ?? 0,
  });

  if (error) throw error;
  return data ?? null;
}

export async function fetchWalletTransactions(context: WalletFetchContext, limit = 50): Promise<WalletTransactionRow[]> {
  const identity = logWalletIdentity(context);

  console.info('[Wallet] Transactions query request', {
    ...identity,
    table: 'public.wallet_transactions',
    filter: `user_id=eq.${context.walletUserId}`,
    limit,
  });

  const { data, error, status } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', context.walletUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  console.info('[Wallet] Transactions query response', {
    ...identity,
    status,
    error,
    rowCount: data?.length ?? 0,
    latestRows: (data ?? []).slice(0, 5),
  });

  if (error) throw error;
  return (data ?? []) as WalletTransactionRow[];
}

export async function fetchWalletBalanceValue(context: WalletFetchContext): Promise<number> {
  const row = await fetchWalletBalanceRow(context);
  return row?.balance_inr ?? 0;
}