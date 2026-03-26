import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useEffect } from 'react';

export interface WalletBalance {
  user_id: string;
  balance_inr: number;
  updated_at: string;
}

export interface WalletTransaction {
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

const WALLET_REASONS: Record<string, string> = {
  no_worker_found: 'Refund: No worker found',
  user_cancelled_before_completion: 'Refund: Booking cancelled',
  user_cancelled: 'Refund: Booking cancelled',
  admin_cancelled: 'Refund: Cancelled by support',
  service_issue: 'Refund: Service issue',
  booking_cancelled: 'Refund: Booking cancelled',
};

export function formatWalletReason(reason: string | null): string {
  if (!reason) return 'Wallet credit';
  return WALLET_REASONS[reason] || `Refund: ${reason.replace(/_/g, ' ')}`;
}

export function useWalletBalance() {
  const { profile } = useProfile();
  const userId = profile?.id;

  return useQuery<WalletBalance | null>({
    queryKey: ['wallet-balance', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('user_wallets')
        .select('user_id, balance_inr, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useWalletTransactions() {
  const { profile } = useProfile();
  const userId = profile?.id;

  return useQuery<WalletTransaction[]>({
    queryKey: ['wallet-transactions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as WalletTransaction[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

/** Invalidate wallet queries — call after booking changes */
export function useWalletRefresh() {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const userId = profile?.id;

  // Subscribe to realtime wallet balance changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallet-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_wallets', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
          qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
          qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return {
    refreshWallet: () => {
      if (!userId) return;
      qc.invalidateQueries({ queryKey: ['wallet-balance', userId] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions', userId] });
    },
  };
}
