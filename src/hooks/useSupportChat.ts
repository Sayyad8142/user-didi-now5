import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { listSupportMessages, markSupportSeen, sendSupportMessage } from '@/lib/supportChatClient';

export type SupportMsg = {
  id: string;
  thread_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen?: boolean;
  seen_at?: string | null;
};

type Mode = 'unknown' | 'supabase' | 'firebase';

export function useSupportChat(threadId?: string | null) {
  const [msgs, setMsgs] = useState<SupportMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<Mode>('unknown');

  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Detect if we have a Supabase session (admin) or Firebase-only (user app)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setMode(data.user ? 'supabase' : 'firebase');
      } catch (e) {
        console.log('⚠️ supabase.auth.getUser failed, assuming firebase mode', e);
        if (alive) setMode('firebase');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load messages + realtime (admin) or polling (firebase)
  useEffect(() => {
    // Always clear subscription on thread changes
    if (chanRef.current) {
      supabase.removeChannel(chanRef.current);
      chanRef.current = null;
    }

    if (!threadId) {
      setMsgs([]);
      setLoading(false);
      return;
    }

    if (mode === 'unknown') {
      setLoading(true);
      return;
    }

    let alive = true;

    // ===== Supabase auth mode (Admin Panel) =====
    if (mode === 'supabase') {
      console.log('🔄 [supabase] Loading messages for thread:', threadId);
      (async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('support_messages')
          .select('id, thread_id, sender, message, created_at, seen, seen_at')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });

        if (!alive) return;
        if (error) {
          console.error('❌ [supabase] Error loading messages:', error);
          setMsgs([]);
        } else {
          setMsgs(
            (data || []).map((msg: any) => ({
              ...msg,
              sender: msg.sender as 'user' | 'admin',
            }))
          );
        }
        setLoading(false);
      })();

      console.log('🎧 [supabase] Setting up real-time subscription for thread:', threadId);
      const ch = supabase
        .channel(`support_messages:${threadId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'support_messages',
            filter: `thread_id=eq.${threadId}`,
          },
          (payload) => {
            const newMsg = payload.new as any;
            setMsgs((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: newMsg.id,
                  thread_id: newMsg.thread_id,
                  sender: newMsg.sender as 'user' | 'admin',
                  message: newMsg.message,
                  created_at: newMsg.created_at,
                  seen: newMsg.seen,
                  seen_at: newMsg.seen_at,
                },
              ];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'support_messages',
            filter: `thread_id=eq.${threadId}`,
          },
          (payload) => {
            const updatedMsg = payload.new as any;
            setMsgs((prev) =>
              prev.map((m) =>
                m.id === updatedMsg.id
                  ? {
                      id: updatedMsg.id,
                      thread_id: updatedMsg.thread_id,
                      sender: updatedMsg.sender as 'user' | 'admin',
                      message: updatedMsg.message,
                      created_at: updatedMsg.created_at,
                      seen: updatedMsg.seen,
                      seen_at: updatedMsg.seen_at,
                    }
                  : m
              )
            );
          }
        )
        .subscribe();

      chanRef.current = ch;

      return () => {
        alive = false;
        if (chanRef.current) supabase.removeChannel(chanRef.current);
        chanRef.current = null;
      };
    }

    // ===== Firebase-only mode (User App) =====
    console.log('🔄 [firebase] Loading messages for thread:', threadId);

    const fetchOnce = async () => {
      try {
        const data = await listSupportMessages(threadId);
        if (!alive) return;
        setMsgs(
          (data || []).map((m: any) => ({
            ...m,
            sender: m.sender as 'user' | 'admin',
          }))
        );
      } catch (e) {
        console.error('❌ [firebase] Error loading messages:', e);
        if (!alive) return;
        setMsgs([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    fetchOnce();
    const poll = window.setInterval(fetchOnce, 2500);

    return () => {
      alive = false;
      window.clearInterval(poll);
    };
  }, [threadId, mode]);

  const send = async (message: string, sender: 'user' | 'admin') => {
    const text = message.trim();
    if (!text) return;
    if (!threadId) {
      console.warn('⚠️ No support threadId available before send');
      return;
    }

    setSending(true);

    // optimistic insert
    const temp: SupportMsg = {
      id: 'temp-' + Date.now(),
      thread_id: threadId,
      sender,
      message: text,
      created_at: new Date().toISOString(),
    };

    setMsgs((prev) => [...prev, temp]);

    try {
      if (mode === 'supabase') {
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

        if (insertError) throw insertError;

        setMsgs((prev) =>
          prev.map((m) =>
            m.id === temp.id
              ? {
                  ...inserted,
                  sender: inserted.sender as 'user' | 'admin',
                }
              : m
          )
        );

        // Update thread metadata for admin list
        await supabase
          .from('support_threads')
          .update({
            last_message: text,
            last_sender: sender,
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId);

        return;
      }

      // Firebase mode: only user can send
      if (sender !== 'user') throw new Error('Only user messages allowed');

      const inserted = await sendSupportMessage(threadId, text);
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === temp.id
            ? {
                ...inserted,
                sender: inserted.sender as 'user' | 'admin',
              }
            : m
        )
      );
    } catch (e) {
      console.error('❌ Error sending support message:', e);
      // rollback optimistic
      setMsgs((prev) => prev.filter((m) => m.id !== temp.id));
      throw e;
    } finally {
      setSending(false);
    }
  };

  const sendUser = async (text: string) => send(text, 'user');

  const markSeen = async () => {
    if (!threadId) return;
    try {
      if (mode === 'supabase') {
        await supabase.rpc('support_mark_seen', { p_thread: threadId });
      } else {
        await markSupportSeen(threadId);
      }

      setMsgs((prev) =>
        prev.map((msg) =>
          msg.sender === 'admin' && !msg.seen ? { ...msg, seen: true, seen_at: new Date().toISOString() } : msg
        )
      );
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  };

  return {
    messages: msgs,
    loading,
    sending,
    send,
    sendUser,
    markSeen,
  };
}
