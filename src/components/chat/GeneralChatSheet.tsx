import React, { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Send, Phone, User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useSupportChat } from '@/hooks/useSupportChat';


interface GeneralChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userProfile?: {
    full_name: string;
    phone: string;
    community: string;
    flat_no: string;
  };
}

export default function GeneralChatSheet({
  open,
  onOpenChange,
  userProfile
}: GeneralChatSheetProps) {
  const [newMessage, setNewMessage] = useState('');
  const [thread, setThread] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { messages, loading, sending, sendUser } = useSupportChat(thread?.id);

  // Get or create support thread
  useEffect(() => {
    const getThread = async () => {
      if (!user || !open) return;
      
      setLoadingThread(true);
      try {
        const { data, error } = await supabase.rpc('support_get_or_create_thread', {
          p_booking_id: null // General support (no specific booking)
        });
        
        if (error) throw error;
        setThread(data);
      } catch (error) {
        console.error('Error getting support thread:', error);
        toast({
          title: "Error",
          description: "Failed to initialize chat",
          variant: "destructive"
        });
      } finally {
        setLoadingThread(false);
      }
    };

    getThread();
  }, [user, open]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !thread) return;

    try {
      await sendUser(newMessage.trim());
      setNewMessage('');
      
      // Auto-scroll to bottom
      setTimeout(() => {
        scrollAreaRef.current?.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    }
  };


  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollAreaRef.current?.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [messages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col bg-background">
        {/* Header */}
        <SheetHeader className="p-4 border-b bg-gradient-to-r from-primary to-primary/80 text-white">
          <SheetTitle className="text-white text-left flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold">Support Chat</div>
              <div className="text-xs text-white/80 font-normal">
                Get help from our support team
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-4">
          {loadingThread || loading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center">
                <User className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">
                Start a conversation with our support team
              </div>
              <div className="text-xs text-muted-foreground">
                We're here to help you 24/7
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isFromUser = message.sender === 'user';
                const time = new Date(message.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      isFromUser ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2 space-y-1",
                        isFromUser
                          ? "bg-gradient-to-r from-primary to-primary/80 text-white"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.message}
                      </div>
                      <div
                        className={cn(
                          "text-[10px] flex items-center gap-1",
                          isFromUser ? "text-white/70" : "text-muted-foreground"
                        )}
                      >
                        <Clock className="w-3 h-3" />
                        {time}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[44px] max-h-32 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending}
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending || !thread}
              className="h-[44px] w-[44px] p-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Quick actions */}
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('tel:8008180018')}
              className="text-xs"
            >
              <Phone className="w-3 h-3 mr-1" />
              Call Support
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}