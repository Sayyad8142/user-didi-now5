import { supabase } from '@/integrations/supabase/client';
import { auth as firebaseAuth } from '@/lib/firebase';
import type { BookingMessage } from '@/lib/types';

export async function fetchMessages(bookingId: string) {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookingMessage[];
}

// Helper to get profile UUID from Firebase UID
async function getProfileId(): Promise<string> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('firebase_uid', user.uid)
    .maybeSingle();
    
  if (error) throw error;
  if (!data?.id) throw new Error('Profile not found');
  
  return data.id;
}

export async function sendMessage(bookingId: string, body: string, opts: {
  senderRole: 'user'|'admin',
  senderName?: string | null
}) {
  // Get profile UUID instead of Firebase UID
  const profileId = await getProfileId();
  
  const { data, error } = await supabase
    .from('booking_messages')
    .insert({
      booking_id: bookingId,
      sender_id: profileId, // Use profile UUID, not Firebase UID
      sender_role: opts.senderRole,
      sender_name: opts.senderName ?? null,
      body: body.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as BookingMessage;
}

export function subscribeMessages(bookingId: string, onInsert: (m: BookingMessage)=>void) {
  const channel = supabase
    .channel(`chat:${bookingId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'booking_messages',
      filter: `booking_id=eq.${bookingId}`,
    }, (payload) => onInsert(payload.new as BookingMessage))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
