-- First, let's check the current structure of maid_pricing_tasks table
-- and add the necessary unique constraint for upserts to work

-- Add unique constraint for maid_pricing_tasks upsert operations
ALTER TABLE public.maid_pricing_tasks 
ADD CONSTRAINT maid_pricing_tasks_unique_key 
UNIQUE (flat_size, task, community);

-- Also ensure cook_pricing_settings has proper unique constraint
ALTER TABLE public.cook_pricing_settings 
ADD CONSTRAINT cook_pricing_settings_unique_key 
UNIQUE (community);

-- And bathroom_pricing_settings 
ALTER TABLE public.bathroom_pricing_settings 
ADD CONSTRAINT bathroom_pricing_settings_unique_key 
UNIQUE (community);