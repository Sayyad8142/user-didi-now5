-- Make upi_id column nullable in workers table
ALTER TABLE public.workers ALTER COLUMN upi_id DROP NOT NULL;