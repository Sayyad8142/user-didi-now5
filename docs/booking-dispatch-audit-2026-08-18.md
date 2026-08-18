# DidiNow Booking & Dispatch Audit Report (2026-08-18)

## 1. Flow Analysis & Trace
The booking flow is architected to be "Payment-First" to prevent orphan bookings and ensure revenue capture before resource allocation.

### A. Instant Booking Journey
1. **Request:** `BookingForm.tsx` collects service details and calculates price (including loyalty and slot surge).
2. **Payment Order:** `create-razorpay-order` stashes the full booking payload in `pending_bookings` table before returning a Razorpay `order_id`. This is the critical recovery point.
3. **Execution:** After checkout, `create-paid-booking` (or `razorpay-webhook`/`reconcile-pending-bookings`) verifies payment and creates the `bookings` row.
4. **Dispatch:** Triggered immediately upon successful booking insertion via `dispatch-pending-bookings`.

### B. Scheduled Booking Journey
1. **Request:** `ScheduleScreen.tsx` creates the booking with `status='pending'`.
2. **Dispatch:** A cron job `scheduled-dispatch` runs every 5 minutes, checking for bookings due in the next 15 minutes, and triggers the `run_scheduled_prealerts` RPC.

---

## 2. Infrastructure Inventory

- **Edge Functions (Lovable Cloud):**
  - `create-razorpay-order`: Order creation + payload stashing.
  - `create-paid-booking`: Atomic verification + creation.
  - `dispatch-pending-bookings`: Wave-based FCM dispatch logic.
  - `razorpay-webhook`: Async payment reconciliation.
  - `reconcile-pending-bookings`: Cron-based recovery for orphan payments.
  - `scheduled-dispatch`: Cron-based trigger for scheduled tasks.

- **External Database (api.didisnow.com):**
  - `bookings`: Main state table.
  - `pending_bookings`: Stash for in-flight payments.
  - `orphan_payments`: Safety log for payments that couldn't be mapped to bookings.
  - `worker_requests`: Records of which workers were notified.
  - `assignments`: Mapping of worker to booking once accepted.

---

## 3. Confirmed Fixes & Improvements

1. **Realtime Sync Hardening:** 
   - `ActiveBookingCard.tsx` now uses a staggered triple-refetch (800ms, 2s, 4.5s) after realtime events to overcome RLS/read-replica consistency delays.
   - The 6s safety poller covers the "Searching" state to ensure transitions are never missed.
2. **Payment Error Clarity:**
   - Added user-friendly handling for `FAV_WORKER_UNAVAILABLE` to guide users during favorite worker fallbacks.
3. **Idempotency Verification:**
   - `create-paid-booking` and `create-booking-from-pending` (shared) perform a dual-idempotency check using `razorpay_payment_id` and `request_id` before inserting.
4. **Capacity Safety:**
   - Server-side `CAPACITY_CHECK_FAILED` and `SUPPLY_FULL` gates are verified in both `create-razorpay-order` (pre-payment) and the DB trigger (post-insert).

---

## 4. Operational Monitoring Guide

### Worker App Correlation
- Log `[DISPATCH_RECEIVED]` on worker device.
- Log `[BOOKING_ACCEPTED]` with booking ID.
- Check `assignments` table for `worker_id` mapping.

### Admin Panel Correlation
- **Orphan Payments:** If a user is charged but no booking appears, check `orphan_payments`.
- **Pending Stash:** Check `pending_bookings` to see if a payload was successfully stashed for a given `order_id`.
- **Telegram Alerts:** New instant bookings trigger alerts to the admin Telegram channel.

### Recent Investigated Flow
- **Scenario:** Favorite worker selected.
- **Trace:** `[FAV_TRACE]` logs in `insertBookingCompat.ts` and `InstantCheckoutScreen.tsx`.
- **Recovery:** Verified fallback to general dispatch if preferred worker fails due to GUC null errors.
