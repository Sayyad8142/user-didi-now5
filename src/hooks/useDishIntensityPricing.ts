import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DishIntensityPrice {
  intensity: string;
  extra_inr: number;
  label: string;
  description: string;
}

const DEFAULTS: DishIntensityPrice[] = [
  { intensity: 'light', extra_inr: 0, label: 'Light', description: '5-10 items' },
  { intensity: 'medium', extra_inr: 30, label: 'Medium', description: '10-20 items' },
  { intensity: 'heavy', extra_inr: 50, label: 'Heavy', description: '20+ items' },
];

export function useDishIntensityPricing(community: string | null | undefined) {
  return useQuery({
    queryKey: ['dish_intensity_pricing', community ?? ''],
    queryFn: async () => {
      // Fetch community-specific + global
      const { data, error } = await supabase
        .from('dish_intensity_pricing')
        .select('intensity, extra_inr, label, description, community')
        .in('community', [community ?? '', '']);

      if (error || !data?.length) return DEFAULTS;

      // Build map: community-specific overrides global
      const map = new Map<string, DishIntensityPrice>();
      // Global first
      data.filter(r => r.community === '').forEach(r => map.set(r.intensity, r));
      // Community override
      if (community) {
        data.filter(r => r.community === community).forEach(r => map.set(r.intensity, r));
      }

      const result = ['light', 'medium', 'heavy'].map(i => 
        map.get(i) ?? DEFAULTS.find(d => d.intensity === i)!
      );
      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
}
