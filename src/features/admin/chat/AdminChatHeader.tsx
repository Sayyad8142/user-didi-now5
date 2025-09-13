import React from 'react';
import { ArrowLeft, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminChatHeaderProps {
  customerName: string;
  customerPhone?: string;
  community?: string;
  flatNo?: string;
  onBack: () => void;
}

export function AdminChatHeader({
  customerName,
  customerPhone,
  community,
  flatNo,
  onBack,
}: AdminChatHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center gap-3 px-4 py-3 max-w-screen-sm mx-auto">
        <button
          onClick={onBack}
          className="p-1 hover:bg-muted rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Circle className="w-5 h-5 text-primary" fill="currentColor" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{customerName}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {customerPhone && (
              <span className="truncate">{customerPhone}</span>
            )}
            {community && flatNo && (
              <>
                <span>•</span>
                <span className="truncate">{community} - {flatNo}</span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Circle className="w-2 h-2 text-green-500" fill="currentColor" />
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
      </div>
    </header>
  );
}