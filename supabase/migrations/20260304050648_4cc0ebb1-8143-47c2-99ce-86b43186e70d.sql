
-- ============================================================
-- Migration: Add missing indexes to reduce Disk IO
-- ============================================================

-- 1) bookings(booking_type, status) — partial on status='pending'
--    Pattern: WHERE booking_type='scheduled' AND status='pending'
--    Used by: check-scheduled-bookings cron, dispatch sweeps
CREATE INDEX IF NOT EXISTS idx_bookings_type_status_pending
  ON public.bookings (booking_type, status)
  WHERE status = 'pending';

-- 2) bookings(user_id)
--    Pattern: WHERE user_id = ?
--    Used by: user booking list, RLS policies
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
  ON public.bookings (user_id);

-- 3) bookings(worker_id, status)
--    Pattern: WHERE worker_id=? AND status IN (...)
--    Used by: worker active bookings, admin assignment checks
CREATE INDEX IF NOT EXISTS idx_bookings_worker_id_status
  ON public.bookings (worker_id, status);

-- 4) workers(is_active, is_available) — partial on is_active=true
--    Pattern: WHERE is_active=true AND is_available=true
--    Used by: dispatch worker selection, online counts
CREATE INDEX IF NOT EXISTS idx_workers_active_available
  ON public.workers (is_active, is_available)
  WHERE is_active = true;

-- 5) booking_events(booking_id)
--    Pattern: WHERE booking_id = ?
--    Used by: event timeline lookups, RLS sub-selects
CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id
  ON public.booking_events (booking_id);

-- 6) bookings(created_at)
--    Pattern: ORDER BY created_at DESC, date range filters
--    Used by: admin daily bookings, history list
CREATE INDEX IF NOT EXISTS idx_bookings_created_at
  ON public.bookings (created_at DESC);

-- 7) booking_requests(status, timeout_at)
--    Pattern: WHERE status='pending' AND timeout_at < now()
--    Used by: timeout sweep cron (every minute)
CREATE INDEX IF NOT EXISTS idx_booking_requests_status_timeout
  ON public.booking_requests (status, timeout_at)
  WHERE status = 'pending';

-- 8) booking_requests(worker_id, status)
--    Pattern: WHERE worker_id=? AND status=?
--    Used by: dispatch logic, worker request lookups
CREATE INDEX IF NOT EXISTS idx_booking_requests_worker_status
  ON public.booking_requests (worker_id, status);

-- ============================================================
-- EXPLAIN suggestions (run manually in SQL Editor):
--
-- a) EXPLAIN (ANALYZE, BUFFERS)
--    SELECT * FROM bookings
--    WHERE booking_type='scheduled' AND status='pending';
--    → Should use idx_bookings_type_status_pending
--
-- b) EXPLAIN (ANALYZE, BUFFERS)
--    SELECT * FROM bookings WHERE user_id = '<uuid>';
--    → Should use idx_bookings_user_id
--
-- c) EXPLAIN (ANALYZE, BUFFERS)
--    SELECT * FROM bookings
--    WHERE worker_id='<uuid>' AND status IN ('accepted','on_the_way','started');
--    → Should use idx_bookings_worker_id_status
--
-- d) EXPLAIN (ANALYZE, BUFFERS)
--    SELECT * FROM workers
--    WHERE is_active=true AND is_available=true;
--    → Should use idx_workers_active_available
--
-- e) EXPLAIN (ANALYZE, BUFFERS)
--    SELECT * FROM booking_events WHERE booking_id='<uuid>';
--    → Should use idx_booking_events_booking_id
-- ============================================================
