
CREATE OR REPLACE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE (service text, online_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow int;
  v_slot text;
BEGIN
  v_dow := extract(dow from now() AT TIME ZONE 'Asia/Kolkata')::int;
  v_slot := to_char(
    date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata') + 
    interval '30 min' * floor(extract(minute from now() AT TIME ZONE 'Asia/Kolkata') / 30),
    'HH24:MI:SS'
  );

  RETURN QUERY
  SELECT 
    svc AS service,
    count(DISTINCT w.id) AS online_count
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  CROSS JOIN unnest(w.service_types) AS svc
  WHERE p_community = ANY(w.communities)
    AND w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    AND wa.day_of_week = v_dow
    AND v_slot = ANY(wa.slots)
  GROUP BY svc;
END;
$$;
