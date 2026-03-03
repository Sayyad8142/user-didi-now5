
CREATE OR REPLACE FUNCTION get_online_workers_count(p_community text)
RETURNS TABLE(service text, online_count bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now() AT TIME ZONE 'Asia/Kolkata';
  v_dow int := EXTRACT(DOW FROM v_now)::int;
  v_current_slot time := date_trunc('hour', v_now::time) + 
    (floor(EXTRACT(MINUTE FROM v_now::time) / 30) * interval '30 minutes');
BEGIN
  RETURN QUERY
  SELECT 
    svc AS service,
    count(DISTINCT w.id) AS online_count
  FROM workers w
  CROSS JOIN unnest(w.service_types) AS svc
  INNER JOIN worker_availability wa 
    ON wa.worker_id = w.id 
    AND wa.day_of_week = v_dow
    AND v_current_slot = ANY(wa.slots)
  WHERE p_community = ANY(w.communities)
    AND w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
  GROUP BY svc;
END;
$$;
