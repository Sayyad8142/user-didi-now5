import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AdminBottomNav } from '@/components/AdminBottomNav';

interface SupportThread {
  id: string;
  user_id: string;
  booking_id?: string;
  last_message?: string;
  last_sender?: 'user' | 'admin';
  updated_at: string;
  created_at: string;
  profiles?: {
    full_name?: string;
    phone?: string;
    community?: string;
    flat_no?: string;
  };
}

interface SupportMessage {
  id: number;
  thread_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen: boolean;
}

export default function AdminChat() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // Load threads
  const loadThreads = async () => {
    try {
      const { data, error } = await supabase
        .from('support_threads')
        .select(`
          *,
          profiles!user_id (
            full_name,
            phone,
            community,
            flat_no
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setThreads((data || []) as SupportThread[]);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load messages for selected thread
  const loadMessages = async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as SupportMessage[]);

      // Mark messages as seen
      await supabase
        .from('support_messages')
        .update({ seen: true, seen_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('sender', 'user')
        .eq('seen', false);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!selectedThread || !newMessage.trim()) return;

    try {
      const { error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: selectedThread.id,
          sender: 'admin',
          message: newMessage.trim(),
        });

      if (error) throw error;
      
      setNewMessage('');
      loadMessages(selectedThread.id);
      loadThreads();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    // Listen for new threads
    const threadsChannel = supabase
      .channel('support_threads_admin')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_threads',
      }, () => {
        loadThreads();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_threads',
      }, () => {
        loadThreads();
      })
      .subscribe();

    // Listen for new messages
    const messagesChannel = supabase
      .channel('support_messages_admin')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      }, (payload) => {
        const newMessage = payload.new as SupportMessage;
        
        // If we're viewing this thread, add the message
        if (selectedThread && newMessage.thread_id === selectedThread.id) {
          setMessages(prev => {
            if (prev.some(msg => msg.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
        
        // Refresh threads to update last message
        loadThreads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(threadsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [selectedThread]);

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'h:mm a');
  };

  const getDisplayName = (thread: SupportThread) => {
    return thread.profiles?.full_name || thread.profiles?.phone || 'Unknown User';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <div className="text-lg font-medium">Loading chats...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
      {/* Mobile-optimized header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg">
              <span className="text-[#ff007a]">Support</span> — <span className="text-[#ff007a]">Messages</span>
            </h1>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">
            {threads.length} conversation{threads.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-6">
        {selectedThread ? (
          /* Chat View */
          <div className="flex-1 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-border">
              <button
                onClick={() => setSelectedThread(null)}
                className="mb-3 text-sm text-primary hover:underline"
              >
                ← Back to conversations
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{getDisplayName(selectedThread)}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedThread.profiles?.phone}
                    {selectedThread.profiles?.community && selectedThread.profiles?.flat_no && (
                      <span className="ml-2">• {selectedThread.profiles.community} - {selectedThread.profiles.flat_no}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.sender === 'admin' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg px-3 py-2",
                        message.sender === 'admin'
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <div className="text-sm">{message.message}</div>
                      <div className={cn(
                        "text-xs mt-1",
                        message.sender === 'admin' 
                          ? "text-primary-foreground/70" 
                          : "text-muted-foreground"
                      )}>
                        {formatTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      sendMessage();
                    }
                  }}
                />
                <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Threads List */
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Conversations</h2>
            </div>
            
            <ScrollArea className="flex-1">
              {threads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => {
                        setSelectedThread(thread);
                        loadMessages(thread.id);
                      }}
                      className={cn(
                        "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                        selectedThread?.id === thread.id && "bg-muted"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {getDisplayName(thread)}
                          </div>
                          {thread.profiles?.community && thread.profiles?.flat_no && (
                            <div className="text-xs text-muted-foreground truncate">
                              {thread.profiles.community} - {thread.profiles.flat_no}
                            </div>
                          )}
                          {thread.last_message && (
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {thread.last_sender === 'admin' ? 'You: ' : ''}
                              {thread.last_message}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(thread.updated_at), 'MMM d, h:mm a')}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
      
      <AdminBottomNav />
    </div>
  );
}