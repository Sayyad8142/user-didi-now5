import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';
import {
  walletBalanceQueryKey,
  walletTransactionsQueryKey,
} from '@/lib/wallet';

/**
 * Global provider that keeps wallet balance in sync via realtime + app resume.
 * Mount once at app root level (inside ProfileProvider & QueryClientProvider).
 *
 * Realtime subscription uses the anon-key client (public channel).
 * Actual data refetch uses authenticated RPC via wallet.ts.
 */
export function WalletRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const userId = profile?.id;
  const qc = useQueryClient();

  const refetchWalletData = useCallback(async (source: string) => {
    if (!userId) return;

    console.info('[WalletRT] Invalidating + refetching wallet data', { source, userId });

    // invalidateQueries forces cache bust + triggers refetch in all active useQuery subscribers
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: walletBalanceQueryKey(userId) }),
      qc.invalidateQueries({ queryKey: walletTransactionsQueryKey(userId) }),
    ]);
  }, [qc, userId]);

  // Initial fetch
  useEffect(() => {
    if (!userId) return;
    void refetchWalletData('wallet-provider-init');
  }, [refetchWalletData, userId]);

  // 1. Realtime subscription for wallet changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`global-wallet-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_wallets', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.info('[WalletRT] user_wallets change received:', payload);
          void refetchWalletData('wallet-realtime.user_wallets');
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.info('[WalletRT] wallet_transactions insert received:', payload);
          void refetchWalletData('wallet-realtime.wallet_transactions');
        }
      )
      .subscribe((status) => {
        console.info('[WalletRT] Channel status:', status, 'for userId:', userId);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchWalletData, userId]);

  // 2. App resume / visibility change → refetch wallet
  useEffect(() => {
    if (!userId) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.info('[WalletRT] App resumed, refetching wallet');
        void refetchWalletData('wallet-visibility.visible');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    let capacitorCleanup: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const listener = App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
              console.info('[WalletRT] Capacitor resumed, refetching wallet');
              void refetchWalletData('wallet-capacitor.active');
            }
          });
          capacitorCleanup = () => { listener.then(l => l.remove()); };
        }
      } catch {
        // Capacitor not available
      }
    })();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      capacitorCleanup?.();
    };
  }, [refetchWalletData, userId]);

  // 3. Polling fallback every 30s — safety net if realtime publication is not enabled
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      void refetchWalletData('wallet-poll-30s');
    }, 30_000);
    return () => clearInterval(interval);
  }, [refetchWalletData, userId]);

  return <>{children}</>;
}
