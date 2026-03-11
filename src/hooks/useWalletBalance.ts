import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

export function useWalletBalance() {
  const { profile } = useProfile();

  const { data: balance = 0, isLoading, refetch } = useQuery({
    queryKey: ['wallet_balance', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_wallets')
        .select('balance_inr')
        .eq('user_id', profile!.id)
        .maybeSingle();

      if (error) throw error;
      return data?.balance_inr ?? 0;
    },
  });

  return { balance, isLoading, refetch };
}
