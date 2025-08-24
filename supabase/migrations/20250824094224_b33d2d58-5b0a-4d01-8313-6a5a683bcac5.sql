-- First, let's create a proper chat messages table if needed and set up RLS
-- Check if booking_messages table needs improvement

-- Enable RLS on booking_messages
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for booking_messages
CREATE POLICY "Users can view messages for their bookings" 
ON public.booking_messages FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_messages.booking_id 
    AND b.user_id = auth.uid()
  )
);

CREATE POLICY "Users can send messages for their bookings" 
ON public.booking_messages FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_messages.booking_id 
    AND b.user_id = auth.uid()
  )
  AND sender_role = 'user'
  AND sender_id = auth.uid()
);

CREATE POLICY "Admins can view all messages" 
ON public.booking_messages FOR SELECT 
USING (public.is_admin());

CREATE POLICY "Admins can send messages to any booking" 
ON public.booking_messages FOR INSERT 
WITH CHECK (
  public.is_admin() 
  AND sender_role = 'admin'
  AND sender_id = auth.uid()
);

-- Enable realtime for booking_messages
ALTER TABLE public.booking_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_messages;