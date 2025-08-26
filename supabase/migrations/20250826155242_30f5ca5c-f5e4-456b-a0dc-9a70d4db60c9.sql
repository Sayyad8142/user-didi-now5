-- Ensure current admin is actually admin
update public.profiles
set is_admin = true
where coalesce(replace(replace(phone,'+',''),' ',''),'') in ('919000666986','9000666986');

-- Create the bucket if it does not exist, make it public
insert into storage.buckets (id, name, public, file_size_limit)
values ('app-pdfs','app-pdfs', true, 8388608)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Note: RLS policies on storage.objects need to be created through Supabase dashboard
-- The policies needed are:
-- 1. Public read access: bucket_id = 'app-pdfs'
-- 2. Admin-only write access: bucket_id = 'app-pdfs' AND public.is_admin()