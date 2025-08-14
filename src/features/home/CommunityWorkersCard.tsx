import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow } from './time';
interface CommunityWorkersCardProps {
  onServiceSelect: (service: 'maid' | 'cook' | 'bathroom_cleaning') => void;
}
const workers = [{
  id: 'maid' as const,
  title: 'Maid',
  avatar: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=100&h=100&fit=crop&crop=face'
}, {
  id: 'cook' as const,
  title: 'Cook',
  avatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=100&h=100&fit=crop&crop=face'
}, {
  id: 'bathroom_cleaning' as const,
  title: 'Bathroom Cleaning',
  avatar: 'https://images.unsplash.com/photo-1494790108755-2616b332905c?w=100&h=100&fit=crop&crop=face'
}];
export function CommunityWorkersCard({
  onServiceSelect
}: CommunityWorkersCardProps) {
  const isLive = isOpenNow();
  return;
}