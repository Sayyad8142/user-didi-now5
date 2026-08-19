# Plan - Restore Instant Booking Availability

Customers are currently unable to book services because the User App incorrectly reports "No workers online". This is likely due to a recently introduced 3-minute heartbeat requirement in the worker eligibility logic that excludes valid workers with slightly stale heartbeats.

## Proposed Changes

### 1. Database Layer (External DB)
- **Refactor `get_online_workers_count` RPC**: Separate current "online" workers (fresh heartbeat) from "dispatch candidates" (eligible workers who might have a stale heartbeat but are otherwise available).
- **Update `get_eligible_workers` RPC**: Relax the hard 3-minute heartbeat constraint to allow workers with older heartbeats as candidates, while still prioritizing fresh ones.
- **Implement `get_dispatch_candidates_count`**: A new RPC to count workers eligible for dispatch regardless of heartbeat freshness.

### 2. Frontend Layer
- **Update `useOnlineWorkerCounts`**: 
    - Fetch both "Fresh" and "Total Candidates" counts.
    - Differentiate between "Online Now" (UI status) and "Dispatchable" (Booking gate).
- **Modify `useInstantBookingAvailability`**:
    - Allow instant booking if `candidateCount > 0`, even if `freshCount == 0`.
    - Provide a `status` flag (`high`, `low`, `none`) to drive UI warnings.
- **Update `BookingForm` & `WorkerAvailabilityUnified`**:
    - Display "Low Availability" warning instead of "No workers online" when candidates exist but heartbeats are stale.
    - Ensure Instant booking remains enabled if candidates are present.

### 3. Edge Functions
- **Verify `check-booking-capacity`**: Ensure it doesn't accidentally block based on heartbeat.
- **Verify `create-paid-booking`**: Ensure it correctly handles dispatch to stale-heartbeat candidates.

## Technical Details

### External DB SQL (for `api.didisnow.com`)
```sql
-- Relax get_eligible_workers to 30 minutes for candidate status, but sort fresh first
CREATE OR REPLACE FUNCTION public.get_eligible_workers(...) ...
-- Change filter from: AND w.last_seen_at >= (now() - interval '3 minutes')
-- To: AND w.last_seen_at >= (now() - interval '30 minutes')
-- And sort: ORDER BY (w.last_seen_at >= now() - interval '3 minutes') DESC, ...

-- New RPC to return detailed availability counts
CREATE OR REPLACE FUNCTION get_detailed_worker_availability(p_community text)
RETURNS TABLE(service text, fresh_count bigint, candidate_count bigint) ...
```

### Hook Updates
- `useOnlineWorkerCounts.ts`: Call the new detailed RPC.
- `useInstantBookingAvailability.ts`: Change `isAvailable` logic to use `candidate_count > 0`.

## Verification Plan
1. **Isolated Testing**: Verify RPC returns candidates even with 10-minute old heartbeats.
2. **UI Check**: Confirm "Instant" is enabled when workers are available but stale.
3. **Dispatch Check**: Verify FCMs are still sent to candidates with stale heartbeats.
