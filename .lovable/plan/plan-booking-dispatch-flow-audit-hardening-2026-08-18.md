# Plan: Booking & Dispatch Flow Audit & Hardening

Audit and harden the complete booking dispatch flow to ensure zero duplicate bookings, reliable status transitions, and robust recovery from network/app failures.

## 1. Trace & Audit (Operations)
- Trace `BookingForm.tsx` (Instant) and `ScheduleScreen.tsx` (Scheduled).
- Audit `paymentService.ts` for idempotency during `create-paid-booking`.
- Verify the "Payment-First" stash mechanism in `create-razorpay-order` and its recovery via `reconcile-pending-bookings` and `razorpay-webhook`.
- Review the `dispatch-pending-bookings` trigger point in `verify-razorpay-payment` and `razorpay-webhook`.
- Audit `ActiveBookingCard.tsx` for state synchronization during the "Searching -> Assigned" transition.

## 2. Hardening Fixes (Safe Implementation)
- **Realtime Resilience:** Harden `ActiveBookingCard.tsx` with a more aggressive 1.5s delayed refetch after any realtime update to mitigate RLS eventual consistency issues.
- **Polling Fallback:** Ensure the 6s safety poller in `ActiveBookingCard.tsx` covers all `pending` states until `assigned_at` is populated.
- **Idempotency Check:** Verify `pending_bookings` table uniquely identifies attempts via `request_id` to prevent double-charging/double-creating.
- **Error Messaging:** Update `toUserFriendlyPaymentError` in `paymentService.ts` to provide clearer guidance for `SUPPLY_FULL` and `CAPACITY_CHECK_FAILED`.

## 3. Verification & Reporting
- Generate a comprehensive audit report in `docs/booking-dispatch-audit-2026-08-18.md`.
- Provide specific logs to look for in the Worker App and Admin Panel for cross-checking.

## Technical Details
- **Tables involved:** `bookings`, `pending_bookings`, `orphan_payments`, `assignments`, `booking_requests`.
- **Edge Functions:** `create-razorpay-order`, `create-paid-booking`, `verify-razorpay-payment`, `razorpay-webhook`, `reconcile-pending-bookings`, `dispatch-pending-bookings`.
- **External DB:** all operations use `EXTERNAL_SUPABASE_URL` pointing at `api.didisnow.com`.
