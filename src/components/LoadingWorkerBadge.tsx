import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Search, User } from 'lucide-react';

interface LoadingWorkerBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'gradient' | 'simple';
}

export function LoadingWorkerBadge({ 
  className = "", 
  size = 'md',
  variant = 'default' 
}: LoadingWorkerBadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-xs gap-2',
    lg: 'px-4 py-2 text-sm gap-2.5'
  };

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5'
  };

  if (variant === 'gradient') {
    return (
      <div className={`flex items-center rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold shadow-lg animate-pulse ${sizeClasses[size]} ${className}`}>
        <div className="relative">
          <Search className={`${iconSizes[size]} animate-pulse`} />
          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        </div>
        <span>FINDING WORKER</span>
        <div className="flex space-x-0.5">
          <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (variant === 'simple') {
    return (
      <Badge variant="secondary" className={`bg-amber-100 text-amber-800 border-amber-200 animate-pulse ${className}`}>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <User className="w-3 h-3" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-600 rounded-full animate-ping" />
          </div>
          Finding Worker
          <div className="flex space-x-0.5 ml-1">
            <div className="w-1 h-1 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-1 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </Badge>
    );
  }

  // Default variant
  return (
    <div className={`flex items-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white font-semibold shadow-lg ${sizeClasses[size]} ${className}`}>
      <div className="relative animate-spin">
        <Search className={iconSizes[size]} />
        <div className="absolute inset-0 border border-white/30 rounded-full animate-ping" />
      </div>
      <span className="animate-pulse">Finding Worker</span>
      <div className="flex space-x-0.5">
        <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
        <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
      </div>
    </div>
  );
}