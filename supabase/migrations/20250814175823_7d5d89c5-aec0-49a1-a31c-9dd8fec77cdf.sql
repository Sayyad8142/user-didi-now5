-- Create pricing table and add columns to bookings
create extension if not exists pgcrypto;

create table if not exists public.pricing (
  id bigserial primary key,
  service_type text not null check (service_type in ('maid','cook','bathroom_cleaning')),
  flat_size   text not null check (flat_size in ('2BHK','2.5BHK','3BHK','3.5BHK','4BHK')),
  price_inr   integer not null check (price_inr >= 0),
  community   text,                       -- null = global pricing; or specific community string
  active      boolean not null default true,
  effective_from date default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists uniq_pricing_service_flat_comm
  on public.pricing (service_type, flat_size, coalesce(community,'GLOBAL'));

alter table public.pricing enable row level security;

create policy "pricing_read_all" on public.pricing for select using (true);

-- Add columns to bookings table
alter table public.bookings
  add column if not exists flat_size text check (flat_size in ('2BHK','2.5BHK','3BHK','3.5BHK','4BHK')),
  add column if not exists price_inr integer;

-- Create trigger for pricing table
create trigger update_pricing_updated_at
before update on public.pricing
for each row
execute function public.update_updated_at_column();

-- Insert sample pricing data
insert into public.pricing (service_type, flat_size, price_inr) values
('maid','2BHK',200),('maid','2.5BHK',250),('maid','3BHK',300),('maid','3.5BHK',350),('maid','4BHK',400),
('cook','2BHK',200),('cook','2.5BHK',250),('cook','3BHK',300),('cook','3.5BHK',350),('cook','4BHK',400),
('bathroom_cleaning','2BHK',200),('bathroom_cleaning','2.5BHK',250),('bathroom_cleaning','3BHK',300),('bathroom_cleaning','3.5BHK',350),('bathroom_cleaning','4BHK',400)
on conflict do nothing;