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
  const authUserId = user?.id;

  const query = useQuery<WalletBalance | null>({
    queryKey: walletBalanceQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        console.warn('[Wallet] No profile.id, skipping balance fetch', {
          authUserId: authUserId ?? null,
          profileId: profile?.id ?? null,
        });
        return null;
      }
      return fetchWalletBalanceRow({
        authUserId,
        profileId: profile?.id ?? null,
        source: 'useWalletBalance',
        walletUserId: userId,
      });
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!userId) return;

    console.info('[Wallet] Final displayed balance', {
      authUserId: authUserId ?? null,
      profileId: profile?.id ?? null,
      walletUserId: userId,
      hasWalletRow: !!query.data,
      finalDisplayedBalance: query.data?.balance_inr ?? 0,
      isFetching: query.isFetching,
      isError: query.isError,
    });
  }, [authUserId, profile?.id, query.data, query.isError, query.isFetching, userId]);

  return query;
}

export function useWalletTransactions() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const userId = profile?.id;
  const authUserId = user?.id;

  return useQuery<WalletTransaction[]>({
    queryKey: walletTransactionsQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        console.warn('[Wallet] No profile.id, skipping transactions fetch', {
          authUserId: authUserId ?? null,
          profileId: profile?.id ?? null,
        });
        return [];
      }

      return fetchWalletTransactions(
        {
          authUserId,
          profileId: profile?.id ?? null,
          source: 'useWalletTransactions',
          walletUserId: userId,
        },
        50,
      );
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
  const { user } = useAuth();
  const userId = profile?.id;
  const authUserId = user?.id;

  return {
    refreshWallet: async () => {
      if (!userId) return;

      console.info('[Wallet] Manual hard refresh triggered', {
        authUserId: authUserId ?? null,
        profileId: profile?.id ?? null,
        walletUserId: userId,
      });

      const [balanceResult, txResult] = await Promise.allSettled([
        qc.fetchQuery({
          queryKey: walletBalanceQueryKey(userId),
          queryFn: () =>
            fetchWalletBalanceRow({
              authUserId,
              profileId: profile?.id ?? null,
              source: 'useWalletRefresh.balance',
              walletUserId: userId,
            }),
        }),
        qc.fetchQuery({
          queryKey: walletTransactionsQueryKey(userId),
          queryFn: () =>
            fetchWalletTransactions(
              {
                authUserId,
                profileId: profile?.id ?? null,
                source: 'useWalletRefresh.transactions',
                walletUserId: userId,
              },
              50,
            ),
        }),
      ]);

      if (balanceResult.status === 'rejected') {
        console.error('[Wallet] Hard refresh balance fetch failed', balanceResult.reason);
      }

      if (txResult.status === 'rejected') {
        console.error('[Wallet] Hard refresh transactions fetch failed', txResult.reason);
      }
    },
  };
}
