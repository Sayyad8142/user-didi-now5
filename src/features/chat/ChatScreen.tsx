import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, Smile } from 'lucide-react';
import { useKeyboardPadding } from '@/hooks/useKeyboardPadding';
import { useSupportChat } from '@/hooks/useSupportChat';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { getSupportThread } from '@/lib/supportChatClient';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { MessageBubble } from './MessageBubble';

const formatDateSeparator = (dateString: string) => {
  const date = new Date(dateString);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
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
  const [threadError, setThreadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  
  const kb = useKeyboardPadding();
  const { markMessagesAsSeen } = useUnseenMessages();
  const { messages, loading, sending, send } = useSupportChat(thread?.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get or create thread
  useEffect(() => {
    const getThread = async () => {
      setLoadingThread(true);
      setThreadError(null);
      try {
        const t = await getSupportThread(bookingId);
        setThread(t);

        if (t) {
          markMessagesAsSeen();
        }
      } catch (error: any) {
        console.error('Error getting thread:', error);
        setThread(null);
        setThreadError(error?.message ?? 'Failed to load chat');
      } finally {
        setLoadingThread(false);
      }
    };

    getThread();
  }, [bookingId, markMessagesAsSeen]);

  const handleBack = () => {
    navigate('/', { replace: true });
  };

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (loadingThread || loading) {
    return (
      <div className="min-h-screen bg-[#ece5dd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#25D366] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-neutral-600">Loading chat...</span>
        </div>
      </div>
    );
  }

  if (threadError) {
    return (
      <div className="min-h-screen bg-[#ece5dd] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 text-center space-y-3 shadow-lg">
          <div className="text-base font-semibold text-neutral-800">Chat unavailable</div>
          <div className="text-sm text-neutral-500">{threadError}</div>
          <Button onClick={() => navigate('/support', { replace: true })} className="w-full bg-[#25D366] hover:bg-[#20bd5a]">
            Go to Support
          </Button>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-[#ece5dd] flex items-center justify-center">
        <div className="text-center text-neutral-500">Chat not initialized.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#ece5dd]" style={{ height: '100dvh' }}>
      {/* Header - WhatsApp style */}
      <header className="shrink-0 bg-[#075E54] text-white shadow-md pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-2 py-3">
          <button 
            aria-label="Back" 
            onClick={handleBack} 
            className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white font-semibold text-sm">
            S
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold leading-tight truncate">Support Team</div>
            <div className="text-xs text-white/80 truncate">Online</div>
          </div>
        </div>
      </header>

      {/* Messages area with WhatsApp wallpaper */}
      <div 
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4cfc4\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          backgroundColor: '#e5ddd5'
        }}
      >
        <div className="mx-auto max-w-[600px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-20 h-20 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                <Send className="w-8 h-8 text-[#25D366]" />
              </div>
              <div className="text-center space-y-2 max-w-xs px-4">
                <div className="text-lg font-medium text-neutral-700">
                  Start a conversation
                </div>
                <div className="text-sm text-neutral-500">
                  Send a message to get help from our support team
                </div>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const showDateSeparator = shouldShowDateSeparator(message, messages[index - 1]);
              
              return (
                <React.Fragment key={message.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-3">
                      <div className="bg-white/90 px-3 py-1 rounded-lg text-xs text-neutral-600 shadow-sm">
                        {formatDateSeparator(message.created_at)}
                      </div>
                    </div>
                  )}
                  
                  <MessageBubble
                    mine={message.sender === 'user'}
                    text={message.message}
                    time={new Date(message.created_at)}
                    seen={message.seen}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer - WhatsApp style */}
      <div 
        className="shrink-0 bg-[#f0f0f0] border-t border-neutral-200"
        style={{ 
          paddingBottom: kb > 0 ? `${kb}px` : 'env(safe-area-inset-bottom)'
        }}
      >
        <div className="flex items-end gap-2 px-2 py-2">
          {/* Emoji button (decorative) */}
          <button className="p-2 text-neutral-500 hover:text-neutral-700 transition-colors">
            <Smile className="w-6 h-6" />
          </button>

          {/* Input field */}
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message"
              rows={1}
              className="w-full resize-none rounded-3xl bg-white border-0 px-4 py-2.5 text-[15px] leading-5 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 max-h-32 shadow-sm"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
              }}
            />
          </div>

          {/* Send button */}
          <button 
            disabled={!input.trim() || sending}
            onClick={handleSendMessage}
            className="w-11 h-11 rounded-full bg-[#25D366] hover:bg-[#20bd5a] disabled:bg-neutral-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-md"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
