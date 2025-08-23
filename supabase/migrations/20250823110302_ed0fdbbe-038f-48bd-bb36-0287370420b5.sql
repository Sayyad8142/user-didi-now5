-- 1) Table
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,              -- plain text or simple markdown-like content
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faqs enable row level security;

-- 2) Touch updated_at trigger
drop trigger if exists faqs_touch_updated on public.faqs;
create trigger faqs_touch_updated
before update on public.faqs
for each row execute procedure public.touch_updated_at();

-- 3) RLS
-- Public (app users) can read only active rows
drop policy if exists faqs_public_read on public.faqs;
create policy faqs_public_read
on public.faqs
for select
to authenticated, anon
using (is_active = true);

-- Admins can do everything
drop policy if exists faqs_admin_all on public.faqs;
create policy faqs_admin_all
on public.faqs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 4) Seed a few items if table is empty
insert into public.faqs (question, answer, sort_order)
select * from (
  values
  ('What is Didi Now?','A quick home-services app for maid, cook, and bathroom cleaning. Instant help in ~10 mins or schedule for later.', 10),
  ('How do I book a service?','Home → choose a service → select options → Book Now (instant) or Schedule (pick date & time).', 20),
  ('How do I pay?','Tap Pay Now after assignment and choose your UPI app. The worker''s UPI ID is pre-filled.', 30),
  ('Need help?','Call support: 8008180018.', 40)
) v(question, answer, sort_order)
where not exists (select 1 from public.faqs);