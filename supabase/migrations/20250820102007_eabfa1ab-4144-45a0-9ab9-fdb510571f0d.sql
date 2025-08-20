-- Fix security warnings by adding search_path to existing functions
-- Fix the functions that were missing search_path

-- For update_updated_at_column function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- For set_updated_at function (ensure it has proper search_path)
create or replace function public.set_updated_at()
returns trigger 
language plpgsql
security definer  
set search_path = public
as $$
begin 
  new.updated_at = now(); 
  return new; 
end $$;