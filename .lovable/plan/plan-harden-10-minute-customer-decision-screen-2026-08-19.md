# Plan - Harden 10-Minute Customer Decision Screen

Harden the 10-minute "Still searching" decision screen in `ActiveBookingCard.tsx` to ensure timing accuracy, persistence of the "Keep Searching" choice, and atomic cancellation.

## User Review Required

> [!IMPORTANT]
> The plan assumes the `bookings` table on the external database has a `customer_continue_waiting_at` column. If it doesn't, I will use a booking-scoped `localStorage` fallback to prevent recurring prompts.

- **Threshold Adjustment**: To test the 10-minute dialog without waiting, I will add a hidden development override (e.g., `window.__DEBUG_DECISION_THRESHOLD_MS__`).
- **Reprompt Logic**: Once "Keep Searching" is clicked, the prompt will stay hidden for that booking until another 10-minute interval passes (if using the DB field) or permanently for that booking (if using localStorage).

## Technical Details

### 1. Timer Accuracy & Reliability
- **Server-Time Offset**: Calculate the clock drift between the server and the phone once per session.
- **Reference Priority**: Use `dispatch_started_at` (if available in schema/data) > `created_at`.
- **Background Persistence**: Ensure the timer resumes correctly when the app is reopened by checking the age of the booking against the server-time-offset on mount.

### 2. "Keep Searching" Persistence
- **Choice Tracking**: When the user clicks "Keep Searching", record this choice to prevent the dialog from popping up immediately on every render or realtime update.
- **Implementation**: 
  - Try to update `bookings.customer_continue_waiting_at` (server-side).
  - Fallback: `localStorage` key `decisionDismissed:${bookingId}`.
- **Reprompt**: Only show again if `now() - customer_continue_waiting_at > 10 minutes`.

### 3. Atomic Cancellation (RPC Audit)
- **RPC Logic**: Verify `public.user_cancel_booking` on the external DB:
  - Must `FOR UPDATE` the booking row.
  - Must fail if `worker_id` is NOT NULL or `status` is NOT 'pending'/'dispatched'.
  - Must return the refund amount (already handled by `wallet_refund_amount` or `payment_amount_inr` triggers).
- **Toast Update**: Display the *actual* amount returned by the backend (or fetched post-cancellation) rather than a local prediction.

### 4. Code Refactoring (`ActiveBookingCard.tsx`)
- Extract decision logic into a dedicated hook or sub-component to keep `ActiveBookingCard` clean.
- Implement robust timer cleanup on unmount.
- Filter out scheduled bookings and non-relevant statuses (assigned, etc.).

## Verification Plan

### Automated/Scripted Tests (Playwright)
- **Timer Trigger**: Use the debug threshold (30s) to verify the dialog appears automatically without refresh.
- **Keep Searching**: Verify clicking hides the dialog and it doesn't reappear on reload.
- **Race Condition**: Mock a worker acceptance just before the cancel button is clicked to verify the "A worker just accepted" toast.

### Manual Verification
- Verify wallet balance increment after cancellation.
- Test app close/reopen after the 10-minute mark.
