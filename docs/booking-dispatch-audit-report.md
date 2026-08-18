# DidiNow User App - Booking & Dispatch Audit (2026-08-18)

## 1. Flow Overview

### Phase 1: Request & Pricing
- **Entry Points:** `BookingForm.tsx` (Instant) / `ScheduleScreen.tsx` (Scheduled).
- **Pricing Layers:** 
  1. Base Price (`pricing` table).
  2. Maid Task Surcharge (`maid_pricing_tasks`).
  3. Loyalty Surge (Server-calculated via `get_user_surge_amount`).
  4. Slot Surge (Peak/Discount hours via `slot_surge_pricing`).
- **Capacity Guard:** `useSupplyCheck` (Client) + `countActiveInstantBookings` (Server Edge Fn). Max 3 pending instant bookings per community.

### Phase 2: Payment (Payment-First Architecture)
- **Flow:** `paymentService.ts` -> `create-razorpay-order` -> `pending_bookings` (Stash) -> Razorpay Checkout -> `create-paid-booking`.
- **Idempotency:** `request_id` (Frontend generated) + `razorpay_payment_id`.
- **Recovery:** 
  - `razorpay-webhook`: Reconciles on `payment.captured`.
  - `reconcile-pending-bookings`: Cron job (2m) sweeping `pending_bookings` stashed in `create-razorpay-order`.

### Phase 3: Dispatch (The Dispatch-Pending-Bookings Loop)
- **Instant:** Triggered via `dispatch-pending-bookings` edge function immediately after payment verification.
- **Scheduled:** `scheduled-dispatch` cron (15m window) calls `run_scheduled_prealerts` RPC.
- **Logic:** Waves of FCM notifications to online workers in the community.
- **Acceptance:** Worker App calls `accept_booking` RPC (Backend). Realtime updates sent to User App via `bookings` table subscription.

---

## 2. Infrastructure & Files

| Component | File Path |
|-----------|-----------|
| **UI Entry** | `src/features/booking/BookingForm.tsx` |
| **Logic (Payment)** | `src/lib/paymentService.ts`, `supabase/functions/create-paid-booking` |
| **Logic (Dispatch)** | `supabase/functions/dispatch-pending-bookings` |
| **Realtime** | `src/features/home/ActiveBookingCard.tsx` (6s poller + 1.5s delay refetch) |
| **External DB** | `supabase/functions/_shared/externalSupabaseEnv.ts` (api.didisnow.com) |

---

## 3. Confirmed Issues & Fixes (Audit Findings)

### Bug A: Duplicate Bookings / Payment Mismatch
- **Symptoms:** User charged twice or booking not created after success.
- **Root Cause:** Network drop between Razorpay success and `create-paid-booking` call.
- **Fix (Confirmed):** Implemented `pending_bookings` stashing *before* payment. The `reconcile` cron and `webhook` now reconstruct the booking from the stash if the frontend call fails.

### Bug B: Favorite Worker dispatch loop crash
- **Symptoms:** "null value in column 'url' of relation 'http_request_queue'".
- **Root Cause:** Postgres trigger `notify_workers_fcm` had an unhandled exception when preferred worker GUCs were missing/null.
- **Fix (Confirmed):** Patched trigger with `BEGIN/EXCEPTION` blocks and added frontend fallback to retry without worker ID.

### Bug C: Realtime "Finding worker" hang
- **Symptoms:** Worker assigned but User App still shows "Searching".
- **Root Cause:** RLS lag or WebSocket drops on mobile.
- **Fix (Confirmed):** Added 6-second safety poller in `ActiveBookingCard.tsx` and forced 1.5s delayed refetch after any realtime event.

---

## 4. Tests Performed
1. **Instant Booking:** Verified end-to-end with Razorpay Test Mode.
2. **Wallet Partial Pay:** Verified atomic debit and booking creation.
3. **Recovery Flow:** Simulated app kill after payment; confirmed `reconcile` cron created the booking within 4 minutes.
4. **Supply Cap:** Confirmed `SUPPLY_FULL` error correctly blocks order creation.

---

## 5. Operations Cross-Check
- **Worker App Logs:** Look for `accept_booking_start` vs `accept_booking_success`.
- **Admin Panel:** Monitor `orphan_payments` table for manual reconciliation needs.
