INSERT INTO public.app_config (enable_pay_after_service)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM public.app_config);

UPDATE public.app_config
SET enable_pay_after_service = true,
    updated_at = now();