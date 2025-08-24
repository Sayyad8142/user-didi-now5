import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageComposerProps {
  onSend: (message: string) => void;
  loading: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ 
  onSend, 
  loading 
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!message.trim() || loading) return;
    onSend(message);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="bg-background border-t border-border px-4 py-3 pb-safe">
      <div className="flex items-end gap-3">
        <div className="flex-1 bg-muted rounded-full border border-input flex items-center px-4 py-2 min-h-[44px]">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message"
            className="flex-1 border-none bg-transparent resize-none min-h-[20px] max-h-24 p-0 text-sm focus:ring-0 focus:outline-none"
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
          />
        </div>
        
        <Button
          onClick={handleSend}
          disabled={!message.trim() || loading}
          className={cn(
            "h-11 w-11 rounded-full p-0 shadow-lg transition-all duration-200",
            !message.trim() || loading
              ? "bg-muted-foreground cursor-not-allowed"
              : "bg-[#F70E79] hover:bg-[#F70E79]/90 hover:scale-105 active:scale-95"
          )}
        >
          <Send className="w-5 h-5 text-white" />
        </Button>
      </div>
    </div>
  );
};