# Dispatcher TODO — Preferred Worker Exclusive Window

Owner: Worker-app / dispatcher service (external repo).
Tracking column added on user-app side: `bookings.preferred_worker_released_at` (see migration TODO below — to be applied on the external DB by ops, since DDL on `api.didisnow.com` is run manually).

## Required behavior

The preferred-worker exclusive dispatch window (currently 15s) MUST re-check the preferred worker's availability at every tick — not just at window start.

### Rules
1. **Tick interval**: every 1–2s during the exclusive window.
2. **Re-check**: query the worker's live state (online, on_shift, not on another active job, not in cooldown).
3. **Early release**: if the preferred worker becomes busy / offline / unavailable at any tick, immediately:
   - Stop the exclusive window.
   - Set `bookings.preferred_worker_released_at = now()`.
   - Open dispatch to the general pool (sequential dispatch resumes).
4. **Natural expiry**: if the window completes without assignment, also set `preferred_worker_released_at = now()` for auditability.
5. **Assignment short-circuit**: if the preferred worker accepts during the window, do NOT set `preferred_worker_released_at`.

### Audit column (apply on external DB)
```sql
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS preferred_worker_released_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_preferred_released
  ON public.bookings (preferred_worker_released_at)
  WHERE preferred_worker_released_at IS NOT NULL;
```

### Why
Without per-tick re-check, a preferred worker that goes offline at t=2s still blocks the pool for the remaining 13s — causing avoidable auto-cancel + refund cycles. Per-tick release keeps p95 assignment time low and reduces wallet refund churn.

### Analytics
When the dispatcher releases early, emit `favorite_worker_unavailable` (already wired in user app on fallback) — or call the new `track-favorite-worker-event` edge function directly from the dispatcher with `event_name = 'favorite_worker_unavailable'` and `fallback_latency_ms = release_time - window_start`.
