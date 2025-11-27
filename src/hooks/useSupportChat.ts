import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SupportMsg = {
  id: string;
  thread_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen?: boolean;
  seen_at?: string | null;
};

export function useSupportChat(threadId: string) {
  const [msgs, setMsgs] = useState<SupportMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!threadId) {
      console.log('⏸️ No threadId yet, skipping message fetch');
      return;
    }
    
    console.log('🔄 Loading messages for thread:', threadId);
    
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender, message, created_at, seen, seen_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (error) {
        console.error('❌ Error loading messages:', error);
      } else {
        console.log('✅ Loaded messages:', data?.length);
        setMsgs((data || []).map(msg => ({
          ...msg,
          sender: msg.sender as 'user' | 'admin'
        })));
      }
      setLoading(false);
    })();

    // realtime (INSERT/UPDATE) scoped to this thread
    console.log('🎧 Setting up real-time subscription for thread:', threadId);
    const ch = supabase
      .channel(`support_messages:${threadId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'support_messages', 
        filter: `thread_id=eq.${threadId}` 
      }, (payload) => {
        console.log('📨 Real-time INSERT:', payload.new);
        const newMsg = payload.new as any;
        setMsgs(prev => {
          // Avoid duplicates
          const exists = prev.some(m => m.id === newMsg.id);
          if (exists) return prev;
          return [...prev, {
            id: newMsg.id,
            thread_id: newMsg.thread_id,
            sender: newMsg.sender as 'user' | 'admin',
            message: newMsg.message,
            created_at: newMsg.created_at,
            seen: newMsg.seen,
            seen_at: newMsg.seen_at,
          }];
        });
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'support_messages', 
        filter: `thread_id=eq.${threadId}` 
      }, (payload) => {
        console.log('📝 Real-time UPDATE:', payload.new);
        const updatedMsg = payload.new as any;
        setMsgs(prev => prev.map(m => m.id === updatedMsg.id ? {
          id: updatedMsg.id,
          thread_id: updatedMsg.thread_id,
          sender: updatedMsg.sender as 'user' | 'admin',
          message: updatedMsg.message,
          created_at: updatedMsg.created_at,
          seen: updatedMsg.seen,
          seen_at: updatedMsg.seen_at,
        } : m));
      })
      .subscribe();

    chanRef.current = ch;

    return () => {
      alive = false;
      console.log('🔌 Cleaning up subscription for thread:', threadId);
      if (chanRef.current) supabase.removeChannel(chanRef.current);
    };
  }, [threadId]);

  const sendUser = async (text: string) => {
    const message = text.trim();
    if (!message) return;
    
    if (!threadId) {
      console.warn('⚠️ No support threadId available before send');
      return;
    }
    
    console.log('📤 Sending user message to thread:', threadId);
    
    // optimistic insert (will be reconciled by realtime INSERT)
    const temp: SupportMsg = {
      id: 'temp-' + Date.now(),
      thread_id: threadId,
      sender: 'user',
      message,
      created_at: new Date().toISOString(),
    };
    setMsgs(prev => [...prev, temp]);

    // Insert message into support_messages
    const { data: inserted, error: insertError } = await supabase
      .from('support_messages')
      .insert({
        thread_id: threadId,
        sender: 'user',
        message,
        seen: false,
      })
      .select('*')
      .single();
      
    if (insertError) {
      console.error('❌ Error inserting support message:', insertError);
      // rollback optimistic on error
      setMsgs(prev => prev.filter(m => m.id !== temp.id));
      throw insertError;
    }
    
    console.log('✅ Support message inserted:', inserted.id);
    
    // Replace optimistic message with real DB row
    setMsgs(prev => prev.map(m => m.id === temp.id ? {
      ...inserted,
      sender: inserted.sender as 'user' | 'admin'
    } : m));

    // Update support_threads metadata so Admin Panel can see it
    const { error: threadError } = await supabase
      .from('support_threads')
      .update({
        last_message: message,
        last_sender: 'user',
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);
      
    if (threadError) {
      console.error('❌ Error updating support_threads metadata:', threadError);
    } else {
      console.log('✅ Support thread metadata updated');
    }
  };

  const send = async (message: string, sender: 'user' | 'admin') => {
    const text = message.trim();
    if (!text) return;
    
    if (!threadId) {
      console.warn('⚠️ No support threadId available before send');
      return;
    }
    
    console.log('🔍 useSupportChat send called with:', { 
      sender, 
      message: text, 
      threadId,
      actualSender: sender
    });
    
    // optimistic insert
    const temp: SupportMsg = {
      id: 'temp-' + Date.now(),
      thread_id: threadId,
      sender,
      message: text,
      created_at: new Date().toISOString(),
    };
    setMsgs(prev => [...prev, temp]);

    // Insert message into support_messages
    const { data: inserted, error: insertError } = await supabase
      .from('support_messages')
      .insert({
        thread_id: threadId,
        sender,
        message: text,
        seen: false,
      })
      .select('*')
      .single();
    
    if (insertError) {
      console.error('❌ Error inserting support message:', insertError);
      // rollback optimistic on error
      setMsgs(prev => prev.filter(m => m.id !== temp.id));
      throw insertError;
    }
    
    console.log('✅ Support message inserted:', inserted.id);
    
    // Replace optimistic message with real DB row
    setMsgs(prev => prev.map(m => m.id === temp.id ? {
      ...inserted,
      sender: inserted.sender as 'user' | 'admin'
    } : m));
    
    // Update support_threads metadata so Admin Panel can see it
    const { error: threadError } = await supabase
      .from('support_threads')
      .update({
        last_message: text,
        last_sender: sender,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);
      
    if (threadError) {
      console.error('❌ Error updating support_threads metadata:', threadError);
    } else {
      console.log('✅ Support thread metadata updated');
    }
  };

  const markSeen = async () => {
    try {
      await supabase.rpc('support_mark_seen', { p_thread: threadId });
      
      // Update local state
      setMsgs(prev => 
        prev.map(msg => 
          msg.sender === 'user' && !msg.seen 
            ? { ...msg, seen: true, seen_at: new Date().toISOString() }
            : msg
        )
      );
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  };

  return { 
    messages: msgs, 
    loading, 
    sending: false, 
    send, 
    sendUser, 
    markSeen 
  };
}