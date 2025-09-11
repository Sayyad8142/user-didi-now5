import React from 'react';
import { Brush, Droplets, Sparkles, CircleDot } from 'lucide-react';

interface CleaningLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CleaningLoader({ size = 'md', className = '' }: CleaningLoaderProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  };

  const containerSizes = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16'
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${containerSizes[size]} ${className}`}>
      {/* Brush - jumps first */}
      <div className="animate-bounce" style={{ animationDelay: '0s', animationDuration: '1s' }}>
        <Brush className={`${sizeClasses[size]} text-blue-500`} />
      </div>
      
      {/* Water droplets - jumps second */}
      <div className="animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '1s' }}>
        <Droplets className={`${sizeClasses[size]} text-cyan-500`} />
      </div>
      
      {/* Cleaning bubble - jumps third */}
      <div className="animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '1s' }}>
        <CircleDot className={`${sizeClasses[size]} text-pink-500`} />
      </div>
      
      {/* Sparkles - jumps fourth */}
      <div className="animate-bounce" style={{ animationDelay: '0.6s', animationDuration: '1s' }}>
        <Sparkles className={`${sizeClasses[size]} text-yellow-500`} />
      </div>
    </div>
  );
}

// Alternative spinning version with cleaning items rotating
export function CleaningSpinner({ size = 'md', className = '' }: CleaningLoaderProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`relative ${className}`}>
      <div className="animate-spin">
        <div className="relative">
          {/* Center sparkle */}
          <Sparkles className={`${sizeClasses[size]} text-yellow-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2`} />
          
          {/* Rotating cleaning items around the center */}
          <div className="relative w-12 h-12 animate-spin" style={{ animationDuration: '2s' }}>
            <Brush className={`${sizeClasses[size]} text-blue-500 absolute -top-1 left-1/2 transform -translate-x-1/2`} />
            <Droplets className={`${sizeClasses[size]} text-cyan-500 absolute top-1/2 -right-1 transform -translate-y-1/2`} />
            <CircleDot className={`${sizeClasses[size]} text-pink-500 absolute -bottom-1 left-1/2 transform -translate-x-1/2`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Pulsing version with cleaning bubbles effect
export function CleaningPulse({ size = 'md', className = '' }: CleaningLoaderProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative">
        {/* Main cleaning brush */}
        <Brush className={`${sizeClasses[size]} text-primary animate-pulse`} />
        
        {/* Floating bubbles around */}
        <div className="absolute -top-2 -right-2 animate-ping" style={{ animationDelay: '0.5s' }}>
          <div className="w-2 h-2 bg-cyan-400 rounded-full opacity-75"></div>
        </div>
        <div className="absolute -bottom-1 -left-2 animate-ping" style={{ animationDelay: '1s' }}>
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full opacity-75"></div>
        </div>
        <div className="absolute -top-1 -left-1 animate-ping" style={{ animationDelay: '1.5s' }}>
          <div className="w-1 h-1 bg-pink-400 rounded-full opacity-75"></div>
        </div>
      </div>
    </div>
  );
}