import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Send, Phone, User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  booking_id: string | null;
  sender_id: string;
  sender_role: 'user' | 'admin';
  sender_name: string | null;
  body: string;
  created_at: string;
}

export default function LiveChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch user profile
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('full_name, phone, community, flat_no')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setUserProfile(data));
    }
  }, [user]);

  // Fetch messages for general support (booking_id is null)
  const fetchMessages = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('booking_messages')
        .select('*')
        .is('booking_id', null)
        .eq('sender_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load chat messages",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !user) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('booking_messages')
        .insert({
          booking_id: null, // General support chat
          sender_id: user.id,
          sender_role: 'user',
          sender_name: userProfile?.full_name || null,
          body: newMessage.trim()
        })
        .select()
        .single();

      if (error) throw error;

      setMessages(prev => [...prev, data as Message]);
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
    } finally {
      setSending(false);
    }
  };

  // Subscribe to real-time messages
  useEffect(() => {
    if (!user) return;

    fetchMessages();

    const channel = supabase
      .channel(`general-chat:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_messages',
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const newMessage = payload.new as Message;
        // Only add if it's a general chat message (booking_id is null)
        if (newMessage.booking_id === null) {
          setMessages(prev => {
            // Check if message already exists to prevent duplicates
            if (prev.some(msg => msg.id === newMessage.id)) return prev;
            return [...prev, newMessage as Message];
          });
          
          // Auto-scroll to bottom
          setTimeout(() => {
            scrollAreaRef.current?.scrollTo({
              top: scrollAreaRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }, 100);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 p-3 bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8 rounded-full text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Support Chat</div>
            <div className="text-xs text-white/80">
              Online • We're here to help
            </div>
          </div>
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                Loading messages...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
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
            <div className="space-y-3 pb-4">
              {messages.map((message) => {
                const isFromUser = message.sender_role === 'user';
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
                        "max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 space-y-1 shadow-sm",
                        isFromUser
                          ? "bg-gradient-to-r from-primary to-primary/90 text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md border"
                      )}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.body}
                      </div>
                      <div
                        className={cn(
                          "text-[10px] flex items-center gap-1 justify-end",
                          isFromUser ? "text-white/70" : "text-muted-foreground"
                        )}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {time}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Input Area - Fixed at bottom with proper spacing for mobile nav */}
      <div className="sticky bottom-0 bg-background border-t p-3 pb-safe-or-20">
        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="min-h-[44px] max-h-24 resize-none rounded-2xl px-4 py-3 pr-12 border-2 focus:border-primary/50 bg-background"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={sending}
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="h-[44px] w-[44px] p-0 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Quick actions */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('tel:8008180018')}
              className="text-xs rounded-full border-primary/20 text-primary hover:bg-primary/5"
            >
              <Phone className="w-3 h-3 mr-1" />
              Emergency Call
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}