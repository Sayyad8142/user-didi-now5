
-- Allow service_role to delete payment_intents (for cleanup function)
CREATE POLICY "payment_intents_service_role_delete"
  ON public.payment_intents
  FOR DELETE
  TO service_role
  USING (true);

-- Allow service_role full access
CREATE POLICY "payment_intents_service_role_all"
  ON public.payment_intents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
