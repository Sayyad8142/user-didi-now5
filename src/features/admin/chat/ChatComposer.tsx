import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled) return;
    
    setSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 5 * 24; // 5 lines * line height
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const canSend = message.trim() && !sending && !disabled;

  return (
    <div className="fixed bottom-24 left-0 right-0 md:bottom-4 z-50 px-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
      <div className="max-w-screen-sm mx-auto">
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <div className="flex items-end gap-2">
            <button
              className="p-2 text-muted-foreground hover:text-foreground transition-colors opacity-50 cursor-not-allowed flex-shrink-0"
              disabled
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            <div className="flex-1 min-w-0">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className={cn(
                  "min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent",
                  "focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2"
                )}
                disabled={disabled || sending}
              />
            </div>
            
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="sm"
              className={cn(
                "p-2 h-10 w-10 rounded-full flex-shrink-0",
                canSend 
                  ? "bg-[#F70E79] hover:bg-[#F70E79]/90 text-white" 
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}