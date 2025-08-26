-- Create a public function to get legal PDF URLs (no admin check required)
CREATE OR REPLACE FUNCTION public.get_legal_pdfs()
RETURNS TABLE(privacy_url text, terms_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    (select value from public.ops_settings where key='privacy_pdf_url') as privacy_url,
    (select value from public.ops_settings where key='terms_pdf_url')   as terms_url;
$function$;