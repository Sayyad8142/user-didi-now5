-- Reset storage policies to avoid function dependency issues
 drop policy if exists "app-pdfs public read" on storage.objects;
 drop policy if exists "app-pdfs admin insert" on storage.objects;
 drop policy if exists "app-pdfs admin update" on storage.objects;
 drop policy if exists "app-pdfs admin delete" on storage.objects;
 
 -- Public read
 create policy "app-pdfs public read"
   on storage.objects for select
   using (bucket_id = 'app-pdfs');
 
 -- Admin-only write using direct EXISTS check (no function dependency)
 create policy "app-pdfs admin insert"
   on storage.objects for insert to authenticated
   with check (
     bucket_id = 'app-pdfs'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin = true
     )
   );
 
 create policy "app-pdfs admin update"
   on storage.objects for update to authenticated
   using (
     bucket_id = 'app-pdfs'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin = true
     )
   );
 
 create policy "app-pdfs admin delete"
   on storage.objects for delete to authenticated
   using (
     bucket_id = 'app-pdfs'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin = true
     )
   );