import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
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

    log.info('[WalletRT] Invalidating + refetching wallet data', { source, userId });

    // invalidateQueries forces cache bust + triggers refetch in all active useQuery subscribers
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: walletBalanceQueryKey(userId) }),
      qc.invalidateQueries({ queryKey: walletTransactionsQueryKey(userId) }),
    ]);
  }, [qc, userId]);

  // Track last successful refetch for TTL guard
  const lastFetchRef = React.useRef<number>(0);
  const guardedRefetch = useCallback(async (source: string, force = false) => {
    const REFETCH_TTL = 60_000;
    const sinceLast = Date.now() - lastFetchRef.current;
    if (!force && sinceLast < REFETCH_TTL) {
      log.info('[WalletRT] skip refetch (within TTL)', { source, sinceLast });
      return;
    }
    lastFetchRef.current = Date.now();
    await refetchWalletData(source);
  }, [refetchWalletData]);

  // Initial fetch — defer until after Home renders so it doesn't block startup
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      void guardedRefetch('wallet-provider-init', true);
    }, 800);
    return () => clearTimeout(t);
  }, [guardedRefetch, userId]);

  // 1. Realtime subscription for wallet changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`global-wallet-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_wallets', filter: `user_id=eq.${userId}` },
        (payload) => {
          log.info('[WalletRT] user_wallets change received:', payload);
          void refetchWalletData('wallet-realtime.user_wallets');
          lastFetchRef.current = Date.now();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          log.info('[WalletRT] wallet_transactions insert received:', payload);
          void refetchWalletData('wallet-realtime.wallet_transactions');
          lastFetchRef.current = Date.now();
        }
      )
      .subscribe((status) => {
        log.info('[WalletRT] Channel status:', status, 'for userId:', userId);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchWalletData, userId]);

  // 2. App resume / visibility change → refetch wallet (TTL-guarded)
  useEffect(() => {
    if (!userId) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void guardedRefetch('wallet-visibility.visible');
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
              void guardedRefetch('wallet-capacitor.active');
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
  }, [guardedRefetch, userId]);

  // 3. Polling fallback — realtime is primary; poll only every 120s as safety net
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      void guardedRefetch('wallet-poll-120s', true);
    }, 120_000);
    return () => clearInterval(interval);
  }, [guardedRefetch, userId]);

  return <>{children}</>;
}
