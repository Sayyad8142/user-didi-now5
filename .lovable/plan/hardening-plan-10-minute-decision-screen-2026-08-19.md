# Hardening Plan: 10-Minute Decision Screen

I will audit, verify, and harden the 10-minute customer decision screen to ensure accuracy, atomicity, and persistence across sessions and network conditions.

## Proposed Changes

### Server-Synced Timer (Already Synced)
- Use `dispatch_started_at` as the primary reference for the 10-minute countdown, falling back to `created_at`.
- Threshold is calculated using `getServerAge()` to prevent manipulation by changing the phone's clock.
- **Verification**: Add a temporary `window.__DEBUG_DECISION_THRESHOLD_MS__` to allow testing with a 30s threshold in a safe test booking.

### Persistent "Keep Searching" Choice
- Prevent the dialog from reopening continuously on renders or refreshes.
- **Improvement**: Record the decision to continue waiting by updating `customer_continue_waiting_at` on the `bookings` table.
- **Fallback**: Maintain booking-scoped `localStorage` state for immediate persistence.
- **Reprompt**: The dialog will reappear after another defined waiting interval (10 minutes) if the booking remains unassigned.

### Atomic Cancellation & Refund Safety
- Replace the client-side check-then-cancel pattern with a single atomic RPC `cancel_unassigned_booking`.
- **Atomicity**: The RPC will lock the row (`FOR UPDATE`), confirm it is still unassigned (`worker_id IS NULL`), update the status, and trigger the wallet refund in a single transaction.
- **Response**: The toast will display the exact refund amount returned by the backend, ensuring the user sees accurate data.

### Timer Activation Resiliency
- Ensure the dialog triggers automatically even without real-time updates.
- Verify timer cleanup on unmount and prevent duplicate timer creation.

## Technical Details

- **SQL**: Add `customer_continue_waiting_at` column and `cancel_unassigned_booking` RPC to the database (applied via provided SQL script).
- **React**: Update `ActiveBookingCard.tsx` to handle the priority timer source and atomic RPC response.
- **Safety**: Guard against race conditions where a worker accepts the booking at the exact moment the user clicks cancel.
