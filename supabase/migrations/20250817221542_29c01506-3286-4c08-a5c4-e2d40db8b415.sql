-- Fix search path for bath_total_price function
create or replace function public.bath_total_price(p_count int, p_community text default '')
returns integer
language sql stable 
security definer
set search_path = 'public'
as $$
  with pick as (
    select unit_price_inr from public.bathroom_pricing_settings
    where community = coalesce(p_community,'')
    union all
    select unit_price_inr from public.bathroom_pricing_settings
    where community = '' limit 1
  )
  select coalesce((select unit_price_inr from pick limit 1), 250) * greatest(p_count,1);
$$;