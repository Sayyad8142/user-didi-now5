import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow } from './time';

interface CommunityWorkersCardProps {
  onServiceSelect: (service: 'maid' | 'cook' | 'bathroom_cleaning') => void;
}

const workers = [
  {
    id: 'maid' as const,
    title: 'Maid',
    avatar: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=100&h=100&fit=crop&crop=face'
  },
  {
    id: 'cook' as const,
    title: 'Cook',
    avatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=100&h=100&fit=crop&crop=face'
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b332905c?w=100&h=100&fit=crop&crop=face'
  }
];

export function CommunityWorkersCard({ onServiceSelect }: CommunityWorkersCardProps) {
  const isLive = isOpenNow();
  
  return (
    <Card className="shadow-card border-emerald-100 bg-emerald-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">
            Available Workers In<br />Your Community
          </h3>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isLive 
              ? 'bg-green-100 text-green-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isLive ? 'bg-green-500' : 'bg-gray-400'
            }`} />
            {isLive ? 'Live' : 'Offline'}
          </div>
        </div>
        
        <div className="space-y-2">
          {workers.map((worker) => (
            <button
              key={worker.id}
              onClick={() => onServiceSelect(worker.id)}
              className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/50 transition-colors"
            >
              <img
                src={worker.avatar}
                alt={worker.title}
                className="w-8 h-8 rounded-full object-cover"
              />
              <span className="text-sm font-medium text-foreground">
                {worker.title}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}