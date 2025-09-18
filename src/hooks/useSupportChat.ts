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

export function useSupportChat(threadId: string | undefined) {
  const [msgs, setMsgs] = useState<SupportMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!threadId) {
      setMsgs([]);
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender, message, created_at, seen, seen_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (!error) setMsgs(data as SupportMsg[]);
      setLoading(false);
    })();

    // realtime (INSERT/UPDATE) scoped to this thread
    if (threadId) {
      const ch = supabase
        .channel(`support_messages:${threadId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `thread_id=eq.${threadId}` },
          (payload) => setMsgs(prev => [...prev, payload.new as SupportMsg])
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages', filter: `thread_id=eq.${threadId}` },
          (payload) => setMsgs(prev => prev.map(m => m.id === payload.new.id ? (payload.new as SupportMsg) : m))
        )
        .subscribe();

      chanRef.current = ch;
    }

    return () => {
      alive = false;
      if (chanRef.current) supabase.removeChannel(chanRef.current);
    };
  }, [threadId]);

  const sendUser = async (text: string) => {
    const message = text.trim();
    if (!message || !threadId) return;
    // optimistic insert (will be reconciled by realtime INSERT)
    const temp: SupportMsg = {
      id: 'temp-' + Date.now(),
      thread_id: threadId,
      sender: 'user',
      message,
      created_at: new Date().toISOString(),
    };
    setMsgs(prev => [...prev, temp]);

    const { error } = await supabase.from('support_messages').insert({
      thread_id: threadId,
      sender: 'user',
      message,
      seen: false,
    });
    if (error) {
      // rollback optimistic on error
      setMsgs(prev => prev.filter(m => m.id !== temp.id));
      throw error;
    }
  };

  const send = async (message: string, sender: 'user' | 'admin') => {
    const text = message.trim();
    if (!text || !threadId) return;
    
    // optimistic insert
    const temp: SupportMsg = {
      id: 'temp-' + Date.now(),
      thread_id: threadId,
      sender,
      message: text,
      created_at: new Date().toISOString(),
    };
    setMsgs(prev => [...prev, temp]);

    const { error } = await supabase.from('support_messages').insert({
      thread_id: threadId,
      sender,
      message: text,
      seen: false,
    });
    if (error) {
      // rollback optimistic on error
      setMsgs(prev => prev.filter(m => m.id !== temp.id));
      throw error;
    }
  };

  const markSeen = async () => {
    if (!threadId) return;
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