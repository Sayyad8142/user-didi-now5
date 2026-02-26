CREATE OR REPLACE FUNCTION get_online_workers_count(p_community text)
RETURNS TABLE(service text, online_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    svc AS service,
    count(DISTINCT w.id) AS online_count
  FROM workers w
  CROSS JOIN unnest(w.service_types) AS svc
  WHERE p_community = ANY(w.communities)
    AND w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
  GROUP BY svc;
END;
$$;