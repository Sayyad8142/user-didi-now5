# Fix iOS cancellation notifications

## Root cause found
Booking-created alerts are sent directly by the booking-creation function through the working user push sender. Customer cancellation also has a direct call, but its payload is incomplete and other cancellation sources rely on a legacy database trigger that targets the old external function host. This leaves admin, worker, and other backend cancellations outside the working production push path.

## Changes
- Reuse the existing `send-user-fcm` pipeline and the profile-linked `user_fcm_tokens` table.
- Send a normalized `booking_cancelled` payload containing the booking ID, safe customer-facing service name, and booking deep link.
- Route non-user cancellation/refund processing through the same cancellation notification helper, with an idempotency key so one cancellation transition cannot notify twice.
- Preserve non-blocking behavior: notification failure never rolls back cancellation or refund.
- Keep the current iOS APNs topic and visible alert payload unchanged, preserving Android behavior.
- Add focused tests for service-name formatting, cancellation payloads, and duplicate suppression where the existing schema supports it.

## Verification
- Deploy only the affected push/cancellation functions.
- Inspect function logs for token lookup, iOS platform, APNs topic, and FCM response.
- Run a safe direct sender test if a suitable recent cancelled test booking and registered iOS token are available; do not cancel a real customer booking.
- Report any physical-device foreground/background/terminated checks that still require the user’s iPhone.
