import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  mine: boolean;
  text: string;
  time: Date;
  seen?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  mine, 
  text, 
  time,
  seen = false
}) => {
  const t = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={cn('w-full flex mb-1', mine ? 'justify-end' : 'justify-start')}>
      <div className="relative">
        {/* Bubble tail */}
        {mine ? (
          <div className="absolute -right-1 top-0 w-3 h-3 overflow-hidden">
            <div className="w-4 h-4 bg-[#dcf8c6] rotate-45 transform origin-bottom-left" />
          </div>
        ) : (
          <div className="absolute -left-1 top-0 w-3 h-3 overflow-hidden">
            <div className="w-4 h-4 bg-white rotate-45 transform origin-bottom-right" />
          </div>
        )}

        <div
          className={cn(
            'relative max-w-[280px] px-3 py-2 shadow-sm',
            mine
              ? 'bg-[#dcf8c6] text-neutral-900 rounded-lg rounded-tr-none'
              : 'bg-white text-neutral-900 rounded-lg rounded-tl-none'
          )}
        >
          <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">
            {text}
          </div>
          <div className={cn('flex items-center justify-end gap-1 mt-0.5', mine ? 'text-neutral-500' : 'text-neutral-400')}>
            <span className="text-[11px]">{t}</span>
            {mine && (
              seen ? (
                <CheckCheck className="w-4 h-4 text-blue-500" />
              ) : (
                <Check className="w-4 h-4 text-neutral-400" />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
