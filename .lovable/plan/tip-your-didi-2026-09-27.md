# Tip Your Didi

## How things work today (and what gets reused)
- **Wallet**: `user_wallets` + `wallet_transactions`; balance changes go through the row-locked `safe_wallet_increment` / `debit_wallet_for_booking` functions (idempotent via a unique reference). Reused for tip debits and tip refunds.
- **Razorpay**: `create-razorpay-order` creates an order from a server-computed amount; `verify-razorpay-payment` checks the signature; `razorpay-webhook` + `check-razorpay-order` recover payments when the app closes. Reused with a new `purpose: "tip"` order type — the booking order is untouched.
- **Booking payment**: payment-first; `create-paid-booking` validates price, debits wallet, inserts booking. Not touched.
- **Worker earnings / commission**: `complete-booking-with-otp` computes gross = booking total, 10% platform fee, net to worker, writes one `worker_payouts` row per booking (unique, 23505-safe).
- **OTP completion**: atomic status update after OTP check; only the winning request writes the payout.
- **Cancellation/refund**: `cancel-booking` / `refund-booking` credit the full `price_inr` to wallet via `_shared/refundAmount.ts`, idempotent by reason+booking.

## Approach (least risk)
Razorpay part of a tip is **credited to the wallet first, then the full tip is debited from the wallet** in one server step. So every tip is a single wallet debit, whatever the payment mix — one path for idempotency, refunds and audit.

## What gets built

**Database (one SQL file for you to run on production — I can't run SQL there)**
- New table `booking_tips`: booking_id, customer_id, worker_id, tip_amount, wallet_amount_used, razorpay_amount_used, razorpay_order_id, razorpay_payment_id, idempotency_key (unique), status (`pending` / `paid` / `refunded` / `credited_to_worker`), paid_at, refunded_at, credited_at, created_at.
- Rule: total paid tips per booking can never exceed ₹50 (checked inside a locking database function, not only in the app).
- `worker_payouts` gets `tip_amount` (default 0) so service earning and tip stay separate.

**Backend functions**
- New `add-booking-tip`: validates amount is 10/20/30/40/50 and the booking total stays ≤ ₹50, booking is assigned/active with a worker, then either debits the wallet (wallet covers it) or returns a Razorpay order for the shortfall only.
- `create-razorpay-order` / `verify-razorpay-payment` / `razorpay-webhook`: handle `purpose: tip` orders → verify → credit shortfall to wallet → debit full tip → mark tip paid. Same idempotency key everywhere, so double-taps, retries and duplicate webhooks apply it once. If the booking was cancelled meanwhile, the money stays in the wallet and no tip is recorded.
- `complete-booking-with-otp`: after the winning completion, add all paid tips to the payout (no 10% on tips), set `worker_id` to the completing worker, mark tips `credited_to_worker`. Repeat OTP requests reuse the existing payout row.
- `cancel-booking` / `refund-booking`: after the existing service refund (unchanged), refund paid tips to the wallet with a separate `tip_refund` reason; mark tips `refunded`.
- `reassign-worker`: move pending/paid tips to the new worker.
- New `get-booking-tips` read endpoint (Firebase-authenticated) for the booking card.

**User App**
- Booking card: "❤️ Add Tip" only when a worker is assigned and the booking is active (not searching, pending, cancelled or failed).
- Bottom sheet "Tip your Didi ❤️ / 100% of your tip goes to your Didi." with ₹10–₹50; options that would push the total over ₹50 are hidden.
- After success: Service Price / Tip / Total Paid lines, "❤️ ₹30 Tip added", and "Add More Tip" while under ₹50.

## Worker App (you update separately)
I'll give you the exact fields: `worker_payouts.payout_amount` (service earning), `worker_payouts.tip_amount`, and `booking_tips` rows for the booking, so it can show Service Earnings + Tip = Total.

## Your steps / limits
- You'll need to run one SQL file in your production database before tips work; until then the tip button stays hidden.
- I can't make real payments, so the 15 test cases will be checked in code and with safe test calls; please run the real wallet and Razorpay tips on your phone.
