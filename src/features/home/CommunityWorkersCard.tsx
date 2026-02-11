import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow } from './time';
interface CommunityWorkersCardProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
}
const workers = [{
  id: 'maid' as const,
  title: 'Maid',
  avatar: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=100&h=100&fit=crop&crop=face'
}, {
  id: 'bathroom_cleaning' as const,
  title: 'Bathroom Cleaning',
  avatar: 'https://images.unsplash.com/photo-1494790108755-2616b332905c?w=100&h=100&fit=crop&crop=face'
}];
export function CommunityWorkersCard({
  onServiceSelect
}: CommunityWorkersCardProps) {
  const isLive = isOpenNow();
  
  return (
    <Card className="shadow-card border-pink-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Community Workers</h3>
          <div className={`text-xs px-2 py-1 rounded-full ${isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isLive ? '● LIVE' : '● OFFLINE'}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {workers.map((worker) => (
            <button
              key={worker.id}
              onClick={() => onServiceSelect(worker.id)}
              className="flex flex-col items-center p-3 rounded-xl bg-gray-50 hover:bg-pink-50 transition-colors"
            >
              <img
                src={worker.avatar}
                alt={worker.title}
                className="w-12 h-12 rounded-full object-cover mb-2"
              />
              <span className="text-xs font-medium text-center">{worker.title}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}