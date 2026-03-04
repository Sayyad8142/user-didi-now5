
-- ============================================================
-- TASK B: worker_presence_snapshots retention cleanup function
-- Deletes rows older than 7 days in batches of 5000 to avoid long locks.
-- Uses existing idx_wps_created_at index for efficient range scans.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_presence_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '7 days';
  batch_size int := 5000;
  deleted_total int := 0;
  deleted_batch int;
BEGIN
  LOOP
    DELETE FROM worker_presence_snapshots
    WHERE id IN (
      SELECT id FROM worker_presence_snapshots
      WHERE created_at < cutoff
      LIMIT batch_size
    );
    GET DIAGNOSTICS deleted_batch = ROW_COUNT;
    deleted_total := deleted_total + deleted_batch;
    EXIT WHEN deleted_batch < batch_size;
    -- yield between batches
    PERFORM pg_sleep(0.1);
  END LOOP;
  RETURN deleted_total;
END;
$$;
