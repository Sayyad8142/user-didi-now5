export type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  sender_name: string | null;
  body: string;
  created_at: string;
};