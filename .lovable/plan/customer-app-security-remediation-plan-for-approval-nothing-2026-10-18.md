# Customer App Security Remediation Plan (for approval — nothing applied)

Labels: CONFIRMED = seen in source. INFERRED = depends on live database rules that have not been checked.

## Critical vulnerabilities

1. **Customer can fake "paid"** (INFERRED, high). `PayWorkerManualSheet.tsx` (confirm handler) writes `payment_status:'paid'`, `payment_method`, `paid_confirmed_by_user`, `paid_confirmed_at`, `user_marked_paid_at` straight to `bookings` from the device. If the database allows it, completion's payment check (`complete-booking-with-otp` step 9) is bypassed. This is leftover pay-to-worker code, which product rules say was removed.
2. **Row-wide customer update policy** (INFERRED, high). `docs/reach-status-rls-migration.sql` defines `users_update_reach_status_on_own_booking` (UPDATE, anon + authenticated, `user_id = get_profile_id()`), with its column guard trigger `guard_user_reach_update` commented out. If live, a customer could change `status`, `completion_otp`, `worker_id`, `price_inr`, `payment_status`.
3. **OTP leaked in push** (CONFIRMED in Cloud function `notify_user_booking_push`): body contains `| OTP: <completion_otp>` and data carries `completion_otp`. The external production database may have the same trigger (not verified).
4. **Weak OTP** (CONFIRMED): 3 digits, `Math.random()`, no expiry, plaintext (`create-paid-booking` `generateOtp()`, `_shared/createBookingFromPending.ts` `generateOtp()`).
5. **No Start OTP on the server** (CONFIRMED). Completion OTP is visible from assignment.

## Task 1 — Every direct customer write to `bookings`

All of these use the anonymous browser database client (no real customer identity in the database; customer identity is Firebase), so `get_profile_id()` probably returns nothing for them — they may already fail silently. Not verified live.

| File / handler | Columns | Business need | Phase 1 could block? | Secure replacement |
|---|---|---|---|---|
| `PayWorkerManualSheet.tsx` confirm handler (used by BookingCard, ActiveBookingCard) | payment_status=paid, payment_method, paid_confirmed_*, user_marked_paid_at | None (pay-to-worker removed) | Only if Phase 1 locks payment columns | Delete the sheet and its entry points |
| `BookingCard.tsx` payment retry catch (~361) | payment_status=failed | Show retry state after Razorpay cancel | Possibly | Drop the write; UI uses local state; webhook/`check-razorpay-order` own the status |
| `BookingForm.tsx` onPayAfterService (~1486), `InstantCheckoutScreen.tsx` (~791), `ScheduleScreen.tsx` (~919) | payment_method, payment_status = pay_after_service | Switch failed online payment to pay-after-service, only when admin flag `enable_pay_after_service` is on | Possibly | New Firebase-authenticated function `switch-to-pay-after-service`: checks owner, flag, booking still unpaid with no captured Razorpay payment |
| `WorkerReachConfirmationCard.tsx` (~128), `ActiveBookingCard.tsx` (~508) fallback | reach_status, reach_confirmed_at, reach_confirmed_by | Customer confirms worker arrived | Only if policy is narrowed | Keep `confirm-worker-reach` function only; remove direct fallback, show retry on failure |

No customer code writes `status`, `completion_otp`, `worker_id` or `price_inr` (CONFIRMED).

## Task 2 — Payment security

- Only trusted sources may set `payment_status` to paid: `verify-razorpay-payment` (signature check), `razorpay-webhook` (HMAC), `check-razorpay-order`/recovery (Razorpay API lookup), `wallet-pay`/`create-paid-booking` (atomic wallet debit).
- Database guard (user runs it): trigger blocking any non-service-role change to `payment_status`, `payment_method`, `price_inr`, `status`, `worker_id`, `completion_otp`, `otp_verified_*`, `paid_confirmed_*`; replace the reach policy with a reach-only update (or revoke customer UPDATE entirely once fallbacks are removed).
- Pay-after-service stays admin-controlled and done by the new function. Razorpay integration and live keys are not touched.

## Task 3 — OTP migration (compatible with live bookings and the current Worker App)

1. New bookings: `crypto.getRandomValues`, 4 digits with leading zeroes kept, in both generators. Worker App must accept 4 digits first (it sends a string; the server compares strings — verify Worker App input length).
2. Keep existing active 3-digit codes valid until those bookings finish.
3. Attempt limits: keep 5-tries + 10s wait; add a per-booking (not per-worker) cap so reassignment cannot reset tries; add an admin unlock.
4. Expiry: invalidate on cancel, complete and reassignment (new code per assignment generation); optional time limit after scheduled slot end.
5. Storage: new `booking_otps` table (service-role only, hashed code + attempt/expiry columns); customer reads through the OTP V2 gateway; leave `completion_otp` populated during transition, then stop exposing it.
6. Workers never receive the code; they only submit it. Audit Worker App reads to ensure `completion_otp` is not selected.
7. Remove code from push body and data (`notify_user_booking_push`, assignment messages), and from logs/error messages.
8. Start OTP: verified server-side first, sets `started`; Completion code only issued after Start is verified. Behind a per-booking `otp_mode` so old bookings keep the legacy flow.

## Task 4 — Phase 1 compatibility

- CONFIRMED safe: the app never sets completed; status display reads `status`/`otp_verified_at` via `bookings-read` and refreshes every 15s/focus/live update.
- INFERRED risks: if Phase 1 also locks customer row updates, these break: pay-after-service switch (3 screens), retry "failed" mark, reach fallback, manual paid sheet (intended to break).

## Remediation sequence

1. User checks live policies/triggers on `bookings` (I'll write a read-only query in `docs/`).
2. App: remove `PayWorkerManualSheet`, the `failed` write and the reach fallbacks; add `switch-to-pay-after-service` function and point the 3 screens at it.
3. Deploy Phase 1 completion lock + database column guard (user runs SQL).
4. Remove OTP from push and logs.
5. Secure 4-digit generation (after Worker App confirmed).
6. `booking_otps` storage + Start OTP with Worker App and Admin, behind `otp_mode`.

## Migration and rollback

- All SQL lives in `docs/` and is run by the user; each step comes with a rollback script (drop the new trigger/policy, restore old policy).
- Columns are only added, never dropped; legacy `completion_otp` kept until every active legacy booking ends.
- App changes ship in a store build before the database lock, so older installed apps that still write directly fail safely (their writes were already dubious).

## Required tests

- Customer cannot set paid/status/OTP/worker/price directly (expect permission denied).
- Pay-after-service switch: allowed only when admin flag on and unpaid; refused after a captured payment.
- Reach confirm works through the function only.
- Correct OTP completes once; wrong OTP 5 times locks; reassignment does not reset the lock; old worker can't complete.
- 4-digit code keeps leading zeros; old 3-digit active codes still work.
- Push bodies/data contain no code.
- Start before Completion for V2 bookings; legacy unaffected.
- No real paid production bookings — use test bookings and mocks.

## GO / NO-GO

- **GO** to deploy Phase 1 completion lock now (Customer App doesn't complete bookings).
- **NO-GO** on declaring payments/OTP secure until steps 1–4 are done.

## Technical notes

- Nothing has been edited, applied, deployed or published for this plan.
- The `src/hooks/use-mobile.tsx` "error" in the message is the upload placeholder text, not a real build error.
