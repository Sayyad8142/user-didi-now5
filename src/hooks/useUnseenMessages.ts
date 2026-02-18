import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { getSupportUnseenCount, markSupportSeen } from '@/lib/supportChatClient';

type Mode = 'unknown' | 'supabase' | 'firebase';

export const useUnseenMessages = () => {
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('firebase');

  // Detect if we have Supabase auth (admin) or Firebase-only (user app)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setMode(data.user ? 'supabase' : 'firebase');
      } catch {
        if (alive) setMode('firebase');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (mode === 'unknown') return;

    const checkUnseenMessages = async () => {
      try {
        if (mode === 'firebase') {
          const { unseen } = await getSupportUnseenCount(null);
          setHasUnseenMessages(unseen > 0);
          return;
        }

        // Supabase auth mode (admin)
        const { data: threadData, error: threadErr } = await supabase.rpc('support_get_or_create_thread');
        if (threadErr) throw threadErr;
        if (!threadData) return;

        const { data: unseenMessages, error } = await supabase
          .from('support_messages')
          .select('id')
          .eq('thread_id', threadData.id)
          .eq('sender', 'admin')
          .eq('seen', false);

        if (error) throw error;
        setHasUnseenMessages((unseenMessages || []).length > 0);
      } catch (error) {
        console.error('Error checking unseen messages:', error);
      }
    };

    // Initial check
    checkUnseenMessages();

    // Firebase mode: lightweight polling
    if (mode === 'firebase') {
      const poll = window.setInterval(checkUnseenMessages, 10000);
      return () => window.clearInterval(poll);
    }

    // Supabase mode: realtime
    const channel = supabase
      .channel('unseen-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
        },
        (payload) => {
          const newMessage = payload.new as any;
          if (newMessage.sender === 'admin') {
            setHasUnseenMessages(true);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_messages',
        },
        (payload) => {
          const updatedMessage = payload.new as any;
          if (updatedMessage.sender === 'admin' && updatedMessage.seen) {
            checkUnseenMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, mode]);

  const markMessagesAsSeen = useCallback(async () => {
    try {
      if (mode === 'firebase') {
        // mark seen on general thread (create if missing)
        const { threadId } = await getSupportUnseenCount(null);
        await markSupportSeen(threadId);
        setHasUnseenMessages(false);
        return;
      }

      const { data: threadData, error: threadErr } = await supabase.rpc('support_get_or_create_thread');
      if (threadErr) throw threadErr;
      if (threadData) {
        await supabase.rpc('support_mark_seen', {
          p_thread: threadData.id,
        });
        setHasUnseenMessages(false);
      }
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  }, [mode]);

  return { hasUnseenMessages, markMessagesAsSeen };
};
