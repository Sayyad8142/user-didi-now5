import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  showDayDivider?: boolean;
}

export function MessageBubble({ message, showDayDivider }: MessageBubbleProps) {
  const messageDate = new Date(message.created_at);
  const isAdmin = message.sender === 'admin';
  
  const getDayLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d, yyyy');
  };

  return (
    <>
      {showDayDivider && (
        <div className="flex justify-center my-4">
          <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
            {getDayLabel(messageDate)}
          </div>
        </div>
      )}
      
      <div
        className={cn(
          "flex mb-3",
          isAdmin ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-3 py-2",
            isAdmin
              ? "bg-[#F70E79] text-white rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
          )}
        >
          <div className="text-sm whitespace-pre-wrap">{message.message}</div>
          <div
            className={cn(
              "text-xs mt-1 flex items-center gap-1",
              isAdmin ? "text-white/70 justify-end" : "text-muted-foreground"
            )}
          >
            <span>{format(messageDate, 'h:mm a')}</span>
            {isAdmin && message.seen && (
              <span className="text-white/70">✓✓</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}