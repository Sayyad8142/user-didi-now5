import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BookingsSettings {
  enabled: boolean;
  message: string;
}

export function useBookingsEnabled() {
  return useQuery({
    queryKey: ['bookings-enabled'],
    queryFn: async (): Promise<BookingsSettings> => {
      const { data, error } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', ['bookings_enabled', 'holiday_message']);

      if (error) throw error;

      const settings = data?.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, string>);

      return {
        enabled: settings?.bookings_enabled === 'true',
        message: settings?.holiday_message || 'Bookings are temporarily unavailable.'
      };
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000
  });
}
