import { Sparkles, ShowerHead, LucideIcon } from 'lucide-react';

export const prettyServiceName = (serviceType: string): string => {
  switch (serviceType) {
    case 'maid':
      return 'Maid Service';
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