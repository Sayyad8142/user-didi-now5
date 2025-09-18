import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SupportMessage {
  id: number;
  thread_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen: boolean;
  seen_at?: string;
}

export const useSupportChat = (threadId?: string) => {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Load messages for thread
  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as SupportMessage[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  // Send message
  const send = useCallback(async (message: string, sender: 'user' | 'admin') => {
    if (!threadId || !message.trim() || sending) return;

    setSending(true);
    // Optimistic update - use negative number for temporary ID to avoid conflicts
    const tempId = -Date.now(); // Negative to distinguish from real IDs
    const optimisticMessage: SupportMessage = {
      id: tempId,
      thread_id: threadId,
      sender,
      message: message.trim(),
      created_at: new Date().toISOString(),
      seen: false,
    };

    try {
      setMessages(prev => [...prev, optimisticMessage]);

      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          sender,
          message: message.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      setMessages(prev => 
        prev.map(msg => 
          msg.id === optimisticMessage.id ? (data as SupportMessage) : msg
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
  }, [threadId, sending]);

  // Mark messages as seen (admin function)
  const markSeen = useCallback(async () => {
    if (!threadId) return;

    try {
      await supabase.rpc('support_mark_seen', { p_thread: threadId });
      
      // Update local state
      setMessages(prev => 
        prev.map(msg => 
          msg.sender === 'user' && !msg.seen 
            ? { ...msg, seen: true, seen_at: new Date().toISOString() }
            : msg
        )
      );
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  }, [threadId]);

  // Set up realtime subscription
  useEffect(() => {
    if (!threadId) return;

    console.log(`🔔 Setting up realtime subscription for thread: ${threadId}`);
    
    const channel = supabase
      .channel(`support_messages:${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        console.log('📥 New message received:', payload.new);
        const newMessage = payload.new as SupportMessage;
        
        // Add new message if it doesn't already exist
        setMessages(prev => {
          if (prev.some(msg => msg.id === newMessage.id)) {
            console.log('⚠️ Message already exists, skipping');
            return prev;
          }
          console.log('✅ Adding new message to state');
          return [...prev, newMessage];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        console.log('📝 Message updated:', payload.new);
        const updatedMessage = payload.new as SupportMessage;
        
        // Update message (e.g., seen status)
        setMessages(prev => 
          prev.map(msg => 
            msg.id === updatedMessage.id ? updatedMessage : msg
          )
        );
      })
      .subscribe((status) => {
        console.log(`🔔 Subscription status for thread ${threadId}:`, status);
      });

    return () => {
      console.log(`🔔 Cleaning up subscription for thread: ${threadId}`);
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  // Load messages when threadId changes
  useEffect(() => {
    if (threadId) {
      loadMessages();
    }
  }, [threadId, loadMessages]);

  return {
    messages,
    loading,
    sending,
    send,
    markSeen,
  };
};