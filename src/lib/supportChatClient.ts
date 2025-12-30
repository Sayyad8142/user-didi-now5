import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken } from '@/lib/firebase';

type SupportThread = {
  id: string;
  user_id: string;
  booking_id: string | null;
  last_message: string | null;
  last_sender: string | null;
  updated_at: string;
  created_at: string;
};

export type SupportMsg = {
  id: string;
  thread_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
  seen?: boolean;
  seen_at?: string | null;
};

async function invokeSupportChat<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('support-chat', {
    body,
    headers: {
      'x-firebase-token': token,
    },
  });

  if (error) throw error;
  return data as T;
}

export async function getSupportThread(bookingId: string | null): Promise<SupportThread> {
  const res = await invokeSupportChat<{ thread: SupportThread }>({
    action: 'get_thread',
    bookingId,
  });
  return res.thread;
}

export async function listSupportMessages(threadId: string): Promise<SupportMsg[]> {
  const res = await invokeSupportChat<{ messages: SupportMsg[] }>({
    action: 'list_messages',
    threadId,
  });
  return res.messages ?? [];
}

export async function sendSupportMessage(threadId: string, message: string): Promise<SupportMsg> {
  const res = await invokeSupportChat<{ message: SupportMsg }>({
    action: 'send_message',
    threadId,
    sender: 'user',
    message,
  });
  return res.message;
}

export async function markSupportSeen(threadId: string): Promise<void> {
  await invokeSupportChat<{ ok: true }>({
    action: 'mark_seen',
    threadId,
  });
}

export async function getSupportUnseenCount(bookingId: string | null = null): Promise<{ threadId: string; unseen: number }> {
  const res = await invokeSupportChat<{ threadId: string; unseen: number }>({
    action: 'unseen',
    bookingId,
  });
  return res;
}
