-- Create communities table
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Communities are viewable by everyone" 
ON public.communities 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage communities" 
ON public.communities 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());

-- Insert initial communities
INSERT INTO public.communities (name, value) VALUES
  ('Prestige High Fields', 'prestige-high-fields'),
  ('Vihanga', 'vihanga'),
  ('Krish', 'krish'),
  ('Other', 'other');

-- Create trigger for updated_at
CREATE TRIGGER update_communities_updated_at
BEFORE UPDATE ON public.communities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();