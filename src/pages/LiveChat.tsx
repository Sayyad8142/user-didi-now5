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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* WhatsApp-like Header */}
      <header className="sticky top-0 z-10 bg-primary text-white shadow-md">
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
              Online • Typically replies instantly
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area with WhatsApp-like background */}
      <div className="flex-1 flex flex-col min-h-0 bg-gray-50 relative">
        {/* WhatsApp pattern background */}
        <div className="absolute inset-0 opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.1'%3E%3Cpath d='M20 20c0 5.5-4.5 10-10 10s-10-4.5-10-10 4.5-10 10-10 10 4.5 10 10zm10 0c0 5.5-4.5 10-10 10s-10-4.5-10-10 4.5-10 10-10 10 4.5 10 10z'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '40px 40px'
          }} />
        </div>
        
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-4 relative z-10">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center text-gray-500">
                Loading messages...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center space-y-2 max-w-sm">
                <div className="text-lg font-medium text-gray-800">
                  Welcome to Support Chat
                </div>
                <div className="text-sm text-gray-600">
                  Our team is ready to help you with any questions or issues
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
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
                      "flex mb-1",
                      isFromUser ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 relative",
                        isFromUser
                          ? "bg-primary text-white rounded-br-none shadow-md"
                          : "bg-white text-gray-800 rounded-bl-none shadow-md border border-gray-100"
                      )}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed mb-1">
                        {message.body}
                      </div>
                      <div
                        className={cn(
                          "text-[11px] flex items-center justify-end gap-1",
                          isFromUser ? "text-white/70" : "text-gray-500"
                        )}
                      >
                        {time}
                        {isFromUser && (
                          <div className="text-white/70">✓✓</div>
                        )}
                      </div>
                      
                      {/* WhatsApp-like message tail */}
                      <div
                        className={cn(
                          "absolute bottom-0 w-0 h-0",
                          isFromUser
                            ? "right-0 border-l-[8px] border-l-primary border-b-[8px] border-b-transparent"
                            : "left-0 border-r-[8px] border-r-white border-b-[8px] border-b-transparent"
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* WhatsApp-like Input Area */}
      <div className="bg-gray-100 px-4 py-2 pb-safe border-t border-gray-200">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-white rounded-full border border-gray-300 flex items-center px-4 py-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message"
              className="flex-1 border-none bg-transparent resize-none min-h-[20px] max-h-20 p-0 text-sm focus:ring-0 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending}
              rows={1}
            />
          </div>
          
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className={cn(
              "h-12 w-12 rounded-full p-0 shadow-lg transition-all duration-200",
              !newMessage.trim() || sending
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
            )}
          >
            <Send className="w-5 h-5 text-white" />
          </Button>
        </div>
        
        {/* Emergency call button */}
        <div className="flex justify-center mt-2 mb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('tel:8008180018')}
            className="text-xs text-gray-600 hover:text-primary hover:bg-primary/5 rounded-full px-3 py-1"
          >
            <Phone className="w-3 h-3 mr-1" />
            Emergency Call
          </Button>
        </div>
      </div>
    </div>
  );
}