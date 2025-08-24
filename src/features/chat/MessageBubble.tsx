import React from 'react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  side: 'left' | 'right';
  text: string;
  time: string;
  status?: 'sent' | 'delivered' | 'seen';
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  side, 
  text, 
  time, 
  status 
}) => {
  const isOutgoing = side === 'right';

  return (
    <div className={cn(
      "flex mb-2",
      isOutgoing ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[78%] rounded-2xl px-3 py-2 relative shadow-sm",
        isOutgoing
          ? "bg-[#F70E79] text-white rounded-br-sm"
          : "bg-white text-foreground rounded-bl-sm border border-border"
      )}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed mb-1">
          {text}
        </div>
        
        <div className={cn(
          "text-xs flex items-center justify-end gap-1 mt-1",
          isOutgoing ? "text-white/70" : "text-muted-foreground"
        )}>
          <span>{time}</span>
          {isOutgoing && status && (
            <div className="text-white/70">
              {status === 'sent' && '✓'}
              {status === 'delivered' && '✓✓'}
              {status === 'seen' && '✓✓'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};