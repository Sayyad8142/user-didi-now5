import React from 'react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  mine: boolean;
  text: string;
  time: Date;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  mine, 
  text, 
  time 
}) => {
  const t = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={`w-full flex ${mine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow ${
        mine 
          ? 'bg-primary text-primary-foreground rounded-br-sm' 
          : 'bg-white text-neutral-900 rounded-bl-sm'
      }`}>
        <div className="whitespace-pre-wrap break-words">{text}</div>
        <div className={`text-[10px] mt-1 ${mine ? 'text-white/80' : 'text-neutral-500'}`}>
          {t}
        </div>
      </div>
    </div>
  );
};