import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { User, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupportChat } from '@/hooks/useSupportChat';
import { cn } from '@/lib/utils';
import { format, isSameDay } from 'date-fns';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { AdminChatHeader } from '@/features/admin/chat/AdminChatHeader';
import { MessageBubble } from '@/features/admin/chat/MessageBubble';
import { ChatComposer } from '@/features/admin/chat/ChatComposer';
import { toast } from '@/hooks/use-toast';

interface SupportThread {
  id: string;
  user_id: string;
  booking_id?: string;
  last_message?: string;
  last_sender?: 'user' | 'admin';
  updated_at: string;
  created_at: string;
  profiles?: {
    id: string;
    full_name?: string;
    phone?: string;
    community?: string;
    flat_no?: string;
  };
  unread_count?: number;
}

interface ThreadWithProfile extends SupportThread {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    community: string;
    flat_no: string;
  } | null;
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
  const [threads, setThreads] = useState<ThreadWithProfile[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sending, send, markSeen } = useSupportChat(selectedThread?.id);

  // Load threads with user profiles and unread counts
  const loadThreads = async () => {
    try {
      console.log('🔍 Loading support threads...');
      
      // Get all threads
      const { data: threadsData, error: threadsError } = await supabase
        .from('support_threads')
        .select('*')
        .order('updated_at', { ascending: false });

      if (threadsError) {
        console.error('❌ Error loading threads:', threadsError);
        throw threadsError;
      }

      console.log('✅ Loaded threads:', threadsData);

      if (!threadsData || threadsData.length === 0) {
        setThreads([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(threadsData.map(t => t.user_id))];
      
      // Get profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, community, flat_no')
        .in('id', userIds);

      if (profilesError) {
        console.error('❌ Error loading profiles:', profilesError);
      }

      console.log('✅ Loaded profiles:', profilesData);

      // Get unread counts for each thread
      const unreadCounts = await Promise.all(
        threadsData.map(async (thread) => {
          const { count } = await supabase
            .from('support_messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)
            .eq('sender', 'user')
            .eq('seen', false);
          
          return { threadId: thread.id, count: count || 0 };
        })
      );

      // Combine threads with profiles and unread counts
      const threadsWithProfiles: ThreadWithProfile[] = threadsData.map(thread => {
        const profile = profilesData?.find(p => p.id === thread.user_id) || null;
        const unreadCount = unreadCounts.find(u => u.threadId === thread.id)?.count || 0;
        
        return {
          ...thread,
          last_sender: thread.last_sender as 'user' | 'admin' | undefined,
          profile,
          unread_count: unreadCount,
        };
      }) as ThreadWithProfile[];

      setThreads(threadsWithProfiles);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle thread selection
  const handleThreadSelect = async (thread: ThreadWithProfile) => {
    setSelectedThread(thread);
    // Mark messages as seen
    if (thread.unread_count && thread.unread_count > 0) {
      await markSeen();
      // Update local unread count
      setThreads(prev => 
        prev.map(t => 
          t.id === thread.id ? { ...t, unread_count: 0 } : t
        )
      );
    }
  };

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  // Scroll to bottom when thread changes
  useEffect(() => {
    if (selectedThread && messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [selectedThread]);

  // Handle sending admin messages
  const handleSendMessage = async (message: string) => {
    try {
      if (!selectedThread) return;
      
      await send(message, 'admin');
      
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  // Set up real-time subscriptions for thread updates
  useEffect(() => {
    // Listen for new threads and thread updates
    const threadsChannel = supabase
      .channel('admin_support_threads')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_threads',
      }, () => {
        loadThreads();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      }, () => {
        // Reload threads when new messages come in to update last_message and unread counts
        loadThreads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(threadsChannel);
    };
  }, []);

  const getDisplayName = (thread: ThreadWithProfile) => {
    return thread.profile?.full_name || thread.profile?.phone || 'Unknown User';
  };

  // Group messages by day and add dividers
  const messagesWithDividers = messages.map((message, index) => {
    const showDayDivider = index === 0 || !isSameDay(
      new Date(message.created_at),
      new Date(messages[index - 1].created_at)
    );
    return { ...message, showDayDivider };
  });

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
    <div className="min-h-[100vh] flex flex-col max-w-screen-sm mx-auto bg-background text-foreground">
      {selectedThread ? (
        /* Chat View */
        <>
          <AdminChatHeader
            customerName={getDisplayName(selectedThread)}
            customerPhone={selectedThread.profile?.phone}
            community={selectedThread.profile?.community}
            flatNo={selectedThread.profile?.flat_no}
            onBack={() => setSelectedThread(null)}
          />
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto pt-16 pb-32 px-4">
            {loading ? (
              <div className="space-y-4 mt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-start">
                    <div className="bg-muted/50 animate-pulse rounded-2xl px-3 py-2 max-w-[80%]">
                      <div className="h-4 bg-muted rounded mb-1"></div>
                      <div className="h-3 bg-muted rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1 mt-4">
                {messagesWithDividers.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    showDayDivider={message.showDayDivider}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <ChatComposer
            onSend={handleSendMessage}
            disabled={sending}
          />
        </>
      ) : (
        /* Threads List */
        <>
          <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-0">
                <h1 className="font-semibold text-lg">
                  <span className="text-[#F70E79]">Support</span> — <span className="text-[#F70E79]">Messages</span>
                </h1>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {threads.length} conversation{threads.length !== 1 ? 's' : ''}
              </span>
            </div>
          </header>

          <div className="flex-1 flex flex-col pb-20">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Conversations</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => handleThreadSelect(thread)}
                      className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm truncate">
                              {getDisplayName(thread)}
                            </div>
                            {thread.unread_count && thread.unread_count > 0 && (
                              <div className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                                {thread.unread_count}
                              </div>
                            )}
                          </div>
                          {thread.profile?.community && thread.profile?.flat_no && (
                            <div className="text-xs text-muted-foreground truncate">
                              {thread.profile.community} - {thread.profile.flat_no}
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
            </div>
          </div>
        </>
      )}
      
      <AdminBottomNav />
    </div>
  );
}