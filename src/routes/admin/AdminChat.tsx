import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupportChat } from '@/hooks/useSupportChat';
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

  // Handle sending admin messages
  const handleSendMessage = async (message: string) => {
    await send(message, 'admin');
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
                    {selectedThread.profile?.phone}
                    {selectedThread.profile?.community && selectedThread.profile?.flat_no && (
                      <span className="ml-2">• {selectedThread.profile.community} - {selectedThread.profile.flat_no}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
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
                        {format(new Date(message.created_at), 'h:mm a')}
                        {message.sender === 'user' && message.seen && (
                          <span className="ml-1">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <Button onClick={() => {
                  const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                  if (input?.value.trim()) {
                    handleSendMessage(input.value);
                    input.value = '';
                  }
                }} disabled={sending}>
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
                      onClick={() => handleThreadSelect(thread)}
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
            </ScrollArea>
          </div>
        )}
      </div>
      
      <AdminBottomNav />
    </div>
  );
}