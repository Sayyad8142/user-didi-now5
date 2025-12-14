import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export const useUnseenMessages = () => {
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const checkUnseenMessages = async () => {
      try {
        // Get or create support thread for user
        const { data: threadData } = await supabase.rpc('support_get_or_create_thread');
        if (!threadData) return;

        // Check for unseen admin messages
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

    // Set up realtime subscription for new admin messages
    const channel = supabase
      .channel('unseen-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      }, (payload) => {
        const newMessage = payload.new as any;
        if (newMessage.sender === 'admin') {
          setHasUnseenMessages(true);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_messages',
      }, (payload) => {
        const updatedMessage = payload.new as any;
        // If admin messages are marked as seen, recheck for remaining unseen admin messages
        if (updatedMessage.sender === 'admin' && updatedMessage.seen) {
          checkUnseenMessages();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Function to mark messages as seen and update state
  const markMessagesAsSeen = async () => {
    try {
      const { data: threadData } = await supabase.rpc('support_get_or_create_thread');
      if (threadData) {
        await supabase.rpc('mark_support_messages_as_seen', {
          p_thread_id: threadData.id
        });
        setHasUnseenMessages(false);
      }
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  };

  return { hasUnseenMessages, markMessagesAsSeen };
};