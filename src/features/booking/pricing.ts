import { supabase } from '@/integrations/supabase/client';
import { Sparkles, ShowerHead, LucideIcon } from 'lucide-react';

export const prettyServiceName = (serviceType: string): string => {
  switch (serviceType) {
    case 'maid':
      return 'Maid';
    case 'bathroom_cleaning':
      return 'Bathroom Cleaning';
    default:
      return 'Service';
  }
};

export const serviceIcon = (serviceType: string): LucideIcon => {
  switch (serviceType) {
    case 'maid':
      return Sparkles;
    case 'bathroom_cleaning':
      return ShowerHead;
    default:
      return Sparkles;
  }
};

export const isValidServiceType = (serviceType: string): boolean => {
  return ['maid', 'bathroom_cleaning'].includes(serviceType);
};

export interface PricingMap {
  [flatSize: string]: number;
}

export const getPricingMap = async (
  serviceType: string, 
  community?: string
): Promise<PricingMap> => {
  try {
    const { data, error } = await supabase
      .from('pricing')
      .select('flat_size, price_inr, community')
      .eq('service_type', serviceType)
      .eq('active', true);

    if (error) {
      console.error('Error fetching pricing:', error);
      return {};
    }

    if (!data) return {};

    // Build pricing map with community-specific overriding global
    const pricingMap: PricingMap = {};
    
    // First, add global pricing (where community is null)
    data
      .filter(row => row.community === null)
      .forEach(row => {
        pricingMap[row.flat_size] = row.price_inr;
      });

    // Then, override with community-specific pricing if available
    if (community) {
      data
        .filter(row => row.community === community)
        .forEach(row => {
          pricingMap[row.flat_size] = row.price_inr;
        });
    }

    return pricingMap;
  } catch (err) {
    console.error('Error in getPricingMap:', err);
    return {};
  }
};

export const FLAT_SIZES = ['2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK'] as const;
export type FlatSize = typeof FLAT_SIZES[number];