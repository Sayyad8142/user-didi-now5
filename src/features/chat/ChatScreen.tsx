import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Send } from 'lucide-react';
import { useKeyboardPadding } from '@/hooks/useKeyboardPadding';
import { useSupportChat } from '@/hooks/useSupportChat';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { MessageBubble } from './MessageBubble';

const formatMessageTime = (dateString: string) => {
  return format(new Date(dateString), 'h:mm a');
};

const formatDateSeparator = (dateString: string) => {
  const date = new Date(dateString);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d, yyyy');
};

const shouldShowDateSeparator = (currentMsg: any, prevMsg: any) => {
  if (!prevMsg) return true;
  return !isSameDay(new Date(currentMsg.created_at), new Date(prevMsg.created_at));
};

export const ChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id') || null;
  const [thread, setThread] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const [input, setInput] = useState('');
  
  const kb = useKeyboardPadding();
  const { markMessagesAsSeen } = useUnseenMessages();
  const { messages, loading, sending, send } = useSupportChat(thread?.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get or create thread
  useEffect(() => {
    const getThread = async () => {
      setLoadingThread(true);
      try {
        const { data, error } = await supabase.rpc('support_get_or_create_thread', {
          p_booking_id: bookingId
        });
        
        if (error) throw error;
        setThread(data);
        
        // Mark messages as seen when chat opens
        if (data) {
          markMessagesAsSeen();
        }
      } catch (error) {
        console.error('Error getting thread:', error);
      } finally {
        setLoadingThread(false);
      }
    };

    getThread();
  }, [bookingId]);

  // Back handler with fallback
  const handleBack = () => {
    // Always navigate to home since chat is typically accessed from home screen
    navigate('/', { replace: true });
  };

  // Handle sending messages
  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    try {
      await send(text, 'user');
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (loadingThread || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-foreground mb-2">
            Loading chat...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen-dvh grid grid-rows-[auto,1fr,auto] bg-[#f5efe7] overscroll-none">
      {/* Header (row 1) */}
      <div className="safe-top sticky top-0 z-40 bg-primary text-primary-foreground">
        <div className="flex items-center gap-3 px-3 py-3">
          <button 
            aria-label="Back" 
            onClick={handleBack} 
            className="p-2 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-col">
            <div className="text-base font-semibold leading-none">Support Team</div>
            <div className="text-[11px] opacity-90">Online • Typically replies in minutes</div>
          </div>
        </div>
      </div>

      {/* Messages list (row 2) */}
      <div 
        className="relative overflow-y-auto px-3 py-3 pb-20" 
        style={{ 
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${Math.max(kb + 120, 140)}px)`,
          marginBottom: kb > 0 ? `${kb}px` : '0px'
        }}
      >
        <div className="mx-auto max-w-[720px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <ChevronLeft className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center space-y-2 max-w-sm">
                <div className="text-lg font-medium text-foreground">
                  Welcome to Support Chat
                </div>
                <div className="text-sm text-muted-foreground">
                  Our team is ready to help you with any questions or issues
                </div>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const showDateSeparator = shouldShowDateSeparator(message, messages[index - 1]);
              
              return (
                <React.Fragment key={message.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-4">
                      <div className="bg-white/80 px-3 py-1 rounded-full text-xs text-muted-foreground">
                        {formatDateSeparator(message.created_at)}
                      </div>
                    </div>
                  )}
                  
                  <MessageBubble
                    mine={message.sender === 'user'}
                    text={message.message}
                    time={new Date(message.created_at)}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer (row 3) */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t" 
        style={{ 
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${kb}px)`,
          transform: kb > 0 ? `translateY(-${kb}px)` : 'translateY(0px)'
        }}
      >
        <div className="mx-auto max-w-[720px] px-2 py-2">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-neutral-200 px-3 py-2 leading-5 focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-36"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
              }}
            />
            <Button 
              disabled={!input.trim() || sending} 
              onClick={handleSendMessage} 
              className="rounded-2xl h-10 px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};