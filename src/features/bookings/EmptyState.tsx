import React from 'react';
import { Calendar, Clock } from 'lucide-react';

interface EmptyStateProps {
  type: 'upcoming' | 'history';
}

export function EmptyState({ type }: EmptyStateProps) {
  const isUpcoming = type === 'upcoming';
  
  return (
    <div className="text-center py-16 px-4">
      <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 flex items-center justify-center">
        {isUpcoming ? (
          <Calendar className="w-12 h-12 text-muted-foreground" />
        ) : (
          <Clock className="w-12 h-12 text-muted-foreground" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {isUpcoming ? 'No upcoming bookings' : 'No history yet'}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {isUpcoming
          ? 'When you book a service, it will appear here'
          : 'Your completed and cancelled bookings will show here'
        }
      </p>
      {isUpcoming && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Book services from the Home tab</span>
        </div>
      )}
    </div>
  );
}