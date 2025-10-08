-- Store Telegram bot credentials in ops_settings
INSERT INTO public.ops_settings (key, value) 
VALUES 
  ('telegram_bot_token', '7982598950:AAE5bRWJy8uAM6bxuW2xpCmO7bHGNkQSRCA'),
  ('telegram_chat_id', '1003053814783')
ON CONFLICT (key) DO UPDATE 
  SET value = EXCLUDED.value, updated_at = now();