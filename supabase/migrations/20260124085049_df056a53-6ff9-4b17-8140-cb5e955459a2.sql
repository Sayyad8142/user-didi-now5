-- Fix: support_threads.user_id references auth.users but we use profiles.id
-- Need to change the foreign key to reference profiles.id instead

-- Drop the existing foreign key constraint
ALTER TABLE public.support_threads 
DROP CONSTRAINT support_threads_user_id_fkey;

-- Add the correct foreign key constraint referencing profiles
ALTER TABLE public.support_threads 
ADD CONSTRAINT support_threads_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;