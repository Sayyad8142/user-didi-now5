import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { useSupportChat } from '@/hooks/useSupportChat';
import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';

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
      } catch (error) {
        console.error('Error getting thread:', error);
      } finally {
        setLoadingThread(false);
      }
    };

    getThread();
  }, [bookingId]);

  // Handle sending messages
  const handleSendMessage = async (message: string) => {
    await send(message, 'user');
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    <div className="min-h-screen bg-[#efeae2] flex flex-col">
      {/* WhatsApp-like Header */}
      <header className="pt-safe sticky top-0 z-10 bg-[#F70E79] text-white shadow-md">
        <div className="flex items-center px-4 py-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8 text-white hover:bg-white/20 mr-3"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mr-3">
            <User className="w-5 h-5" />
          </div>
          
          <div className="flex-1">
            <div className="font-medium text-white">Support Team</div>
            <div className="text-xs text-white/80">
              Online • Typically replies in minutes
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* WhatsApp pattern background */}
        <div className="absolute inset-0 opacity-5">
          <div 
            className="w-full h-full" 
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.1'%3E%3Cpath d='M20 20c0 5.5-4.5 10-10 10s-10-4.5-10-10 4.5-10 10-10 10 4.5 10 10zm10 0c0 5.5-4.5 10-10 10s-10-4.5-10-10 4.5-10 10-10 10 4.5 10 10z'/%3E%3C/g%3E%3C/svg%3E")`,
              backgroundSize: '40px 40px'
            }}
          />
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-4 relative z-10 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F70E79]/20 to-[#F70E79]/10 flex items-center justify-center">
                <User className="w-8 h-8 text-[#F70E79]" />
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
            <div className="space-y-1">
              {messages.map((message, index) => {
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
                      side={message.sender === 'user' ? 'right' : 'left'}
                      text={message.message}
                      time={formatMessageTime(message.created_at)}
                      status={message.sender === 'user' ? (message.seen ? 'seen' : 'delivered') : undefined}
                    />
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Message Composer */}
      <MessageComposer onSend={handleSendMessage} loading={sending} />
    </div>
  );
};