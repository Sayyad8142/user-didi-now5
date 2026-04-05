import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Global provider that keeps wallet balance in sync via realtime + app resume.
 * Mount once at app root level (inside ProfileProvider & QueryClientProvider).
 */
export function WalletRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const userId = profile?.id;
  const qc = useQueryClient();

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
          qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
          qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.info('[WalletRT] wallet_transactions insert received:', payload);
          qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
          qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
        }
      )
      .subscribe((status) => {
        console.info('[WalletRT] Channel status:', status, 'for userId:', userId);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  // 2. App resume / visibility change → refetch wallet
  useEffect(() => {
    if (!userId) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.info('[WalletRT] App resumed, refetching wallet for:', userId);
        qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
        qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Also listen for Capacitor resume via custom event pattern
    let capacitorCleanup: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const listener = App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
              qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
              qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
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
  }, [userId, qc]);

  return <>{children}</>;
}
