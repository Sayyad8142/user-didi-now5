-- Update Telegram chat ID with negative prefix for group chat
UPDATE public.ops_settings 
SET value = '-1003053814783', updated_at = now()
WHERE key = 'telegram_chat_id';