
-- Payment intents table: stores booking data before payment is completed
-- For instant bookings, the booking row is only created after payment succeeds
CREATE TABLE public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  razorpay_order_id text,
  amount_inr integer NOT NULL,
  booking_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- Enable RLS
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- Users can read their own intents
CREATE POLICY "payment_intents_select_own"
  ON public.payment_intents
  FOR SELECT
  TO public
  USING (user_id = get_profile_id());

-- No direct insert/update from client - only edge functions with service_role
