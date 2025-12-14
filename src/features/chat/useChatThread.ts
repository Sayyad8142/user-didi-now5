import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { SupportMsg } from '@/hooks/useSupportChat';

interface SupportThread {
  id: string;
  user_id: string;
  booking_id?: string;
  last_message?: string;
  last_sender?: 'user' | 'admin';
  updated_at: string;
  created_at: string;
}

export const useChatThread = (bookingId?: string) => {
  const { user } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const getOrCreateThread = useCallback(async () => {
    if (!user) return;

    try {
      // First try to get existing thread
      const { data: existingThread, error: fetchError } = await supabase
        .from('support_threads')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingThread) {
        setThread(existingThread as SupportThread);
        return existingThread as SupportThread;
      }

      // Create new thread if none exists
      const { data: newThread, error: createError } = await supabase
        .from('support_threads')
        .insert({
          user_id: user.id,
          booking_id: bookingId || null,
        })
        .select()
        .single();

      if (createError) throw createError;

      setThread(newThread as SupportThread);
      return newThread as SupportThread;
    } catch (error) {
      console.error('Error getting/creating thread:', error);
      return null;
    }
  }, [user, bookingId]);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender, message, created_at, seen, seen_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages((data || []) as SupportMsg[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!thread || !text.trim() || sending) return;

    setSending(true);
    // Use string temp ID for UUID compatibility
    const tempId = 'temp-' + Date.now();
    const optimisticMessage: SupportMsg = {
      id: tempId,
      thread_id: thread.id,
      sender: 'user',
      message: text.trim(),
      created_at: new Date().toISOString(),
      seen: false,
    };

    try {
      setMessages(prev => [...prev, optimisticMessage]);

      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: thread.id,
          sender: 'user',
          message: text.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      setMessages(prev => 
        prev.map(msg => 
          msg.id === optimisticMessage.id ? (data as SupportMsg) : msg
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => 
        prev.filter(msg => msg.id !== tempId)
      );
    } finally {
      setSending(false);
    }
  }, [thread, sending]);

  // Initialize thread and messages
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const threadData = await getOrCreateThread();
      if (threadData && mounted) {
        await loadMessages(threadData.id);
      }
      if (mounted) {
        setLoading(false);
      }
    };

    if (user) {
      init();
    }

    return () => {
      mounted = false;
    };
  }, [user, getOrCreateThread, loadMessages]);

  // Set up realtime subscription
  useEffect(() => {
    if (!thread) return;

    const channel = supabase
      .channel(`support_messages:${thread.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_id=eq.${thread.id}`,
      }, (payload) => {
        const newMessage = payload.new as SupportMsg;
        
        // Don't add if it's from the current user (already optimistically added)
        if (newMessage.sender === 'admin') {
          setMessages(prev => {
            // Check if message already exists
            if (prev.some(msg => msg.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread]);

  return {
    thread,
    messages,
    loading,
    sending,
    sendMessage,
  };
};