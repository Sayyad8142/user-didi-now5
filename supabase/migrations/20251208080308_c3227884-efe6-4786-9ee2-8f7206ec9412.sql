-- Update get_app_setting function to allow terms keys as well
CREATE OR REPLACE FUNCTION public.get_app_setting(k text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT value
    FROM public.ops_settings
    WHERE key = k
      AND key IN (
        'privacy_policy_markdown',
        'privacy_pdf_url',
        'privacy_policy_updated_at',
        'privacy_policy_url',
        'terms_pdf_url',
        'terms_policy_updated_at',
        'terms_policy_url'
      )
  );
END;
$$;