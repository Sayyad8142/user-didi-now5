import React, { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface ImageSkeletonProps {
  width?: number;
  height?: number;
  className?: string;
  children: React.ReactElement;
}

export default function ImageSkeleton({ width, height, className, children }: ImageSkeletonProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {!loaded && (
        <Skeleton 
          className="absolute inset-0 rounded-inherit animate-pulse"
          style={{ width: '100%', height: '100%' }}
        />
      )}
      {React.cloneElement(children, {
        ...children.props,
        onLoad: () => {
          setLoaded(true);
          children.props.onLoad?.();
        },
        style: {
          ...children.props.style,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out'
        }
      })}
    </div>
  );
}