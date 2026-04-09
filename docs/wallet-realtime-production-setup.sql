-- =============================================================
-- PRODUCTION DB: Enable realtime for wallet tables
-- Run this on the production Supabase project (paywwbuqycovjopryele)
-- =============================================================

-- Enable realtime publication so the user app receives live updates
-- when admin credits money or refunds happen
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- =============================================================
-- Verify the wallet RPCs handle Firebase UID → profile UUID mapping
-- The RPCs should internally do:
--   SELECT id FROM profiles WHERE firebase_uid = auth.uid()::text
-- then use that id to query user_wallets/wallet_transactions
-- =============================================================

-- Check existing RPC definitions:
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('get_my_wallet_balance', 'get_my_wallet_transactions');

-- If the RPCs use auth.uid() directly as user_id, they need to be
-- updated to first resolve the profile UUID:
--
-- CREATE OR REPLACE FUNCTION get_my_wallet_balance()
-- RETURNS numeric
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
--   SELECT COALESCE(w.balance_inr, 0)
--   FROM profiles p
--   LEFT JOIN user_wallets w ON w.user_id = p.id
--   WHERE p.firebase_uid = auth.uid()::text
--   LIMIT 1;
-- $$;
