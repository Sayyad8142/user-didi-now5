import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { useEffect } from 'react';
import {
  fetchWalletBalanceRow,
  fetchWalletTransactions,
  walletBalanceQueryKey,
  walletTransactionsQueryKey,
  type WalletBalanceRow,
  type WalletTransactionRow,
} from '@/lib/wallet';

export type WalletBalance = WalletBalanceRow;
export type WalletTransaction = WalletTransactionRow;

const WALLET_REASONS: Record<string, string> = {
  no_worker_found: 'Refund: No worker available',
  user_cancelled_before_completion: 'Refund: Booking cancelled',
  user_cancelled: 'Refund: Booking cancelled',
  admin_cancelled: 'Refund: Cancelled by support',
  service_issue: 'Refund: Service issue',
  booking_cancelled: 'Refund: Booking cancelled',
  system_expiry: 'Refund: Booking expired',
  dispatch_expired: 'Refund: No worker assigned',
  booking_payment: 'Booking payment',
};

export function formatWalletReason(reason: string | null): string {
  if (!reason) return 'Wallet credit';
  return WALLET_REASONS[reason] || `Refund: ${reason.replace(/_/g, ' ')}`;
}

export function useWalletBalance() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const userId = profile?.id;

  const query = useQuery<WalletBalance | null>({
    queryKey: walletBalanceQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        console.warn('[Wallet] No profile.id, skipping balance fetch');
        return null;
      }
      console.info('[Wallet] useWalletBalance queryFn called', {
        userId,
        authUserId: user?.id,
      });
      return fetchWalletBalanceRow();
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!userId) return;
    console.info('[Wallet] Displayed balance', {
      userId,
      balance: query.data?.balance_inr ?? 0,
      isFetching: query.isFetching,
      isError: query.isError,
    });
  }, [query.data, query.isError, query.isFetching, userId]);

  return query;
}

export function useWalletTransactions() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const userId = profile?.id;

  return useQuery<WalletTransaction[]>({
    queryKey: walletTransactionsQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        console.warn('[Wallet] No profile.id, skipping transactions fetch');
        return [];
      }
      console.info('[Wallet] useWalletTransactions queryFn called', { userId });
      return fetchWalletTransactions(50);
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Invalidate wallet queries — call after booking changes */
export function useWalletRefresh() {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const userId = profile?.id;

  return {
    refreshWallet: async () => {
      if (!userId) return;

      console.info('[Wallet] Manual refresh triggered — invalidating cache', { userId });

      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: walletBalanceQueryKey(userId) }),
        qc.invalidateQueries({ queryKey: walletTransactionsQueryKey(userId) }),
      ]);
    },
  };
}
