# Customer OTP V2 source readiness

## 1. Files changed
- New shared modules in `src/features/bookings/`: `otpContract.ts`, `otpGatewayTransport.ts`, `otpGatewayClient.ts`, `otpLifecycle.ts`, `useBookingOtp.ts`, `BookingOtpDisplay.tsx`.
- Display/read integration: `HomeOtpCard.tsx`, `ActiveBookingCard.tsx` (removed unused legacy sheet), `BookingCard.tsx`, `BookingsScreen.tsx`, `bookingsReadClient.ts`, `useMyBookingsRealtime.ts`, `src/pages/BookingDetail.tsx`.
- Presentation safety: `src/lib/whatsappShare.ts`, `src/lib/otpNotificationSafety.ts`, `src/lib/firebase.ts`, `src/hooks/usePushNotifications.ts`, `src/hooks/usePushDeepLink.ts`.
- Tests: `tests/otp-v2.test.ts`, `tests/otp-harness.tsx`, package test command. Architecture/task tracking: `AGENTS.md`, `roadmap.md`.
- `src/lib/utils.ts` unchanged: six-line `cn()` helper, no number-to-string assignment. Current preview compilation passes.

## 2. UI implemented
Shared Start/Completion display on Home and booking cards (also used by Booking Details). Four-digit strings preserve leading zeroes. Pending, cancelled and completed states display neither credential. Start is accepted only before started/in_progress; Completion requires both a gateway Completion response and started/in_progress status. Rating gate remains. Layout verified at 393px and 1280px with isolated fixtures.

## 3. Gateway integration
Exact retrieve contract uses the existing publishable key and Firebase ID token in `x-firebase-token`, without a customer backend-auth session. HTTP 401/403 triggers one forced token refresh. CREDENTIALS_NOT_READY has at most three reads per refresh, separated by bounded backoff. Errors do not contain raw response bodies. `OTP_V2_GATEWAY_ENABLED` is false, so transport makes no live V2 calls. No mock credential is inserted into real customer screens.

## 4. Legacy compatibility
While the gateway is disabled, bookings not marked V2 continue to use legacy completion credentials and existing paid/pay-after/wallet gates. When enabled, only explicit LEGACY_BOOKING permits legacy fallback. V2 unavailable, invalid, unauthorized and failed responses hide all codes. A lifecycle remembers observed V2 mode and refuses downgrade during its mounted booking session.

## 5. Safety corrections
Removed Check-in wording and corrected legacy WhatsApp instructions to share only after work finishes. V2 codes have no WhatsApp URL-based share action. Codes are kept only in local display memory, never React Query gateway caches or browser storage. Generic booking reads remove start credentials and explicit V2 completion credentials. Reassignment/status/generation changes invalidate the display; request epochs reject late responses. Logout/background clears credentials; foreground, realtime and safety polling revalidate. Foreground notification text redacts labelled OTPs; raw push payload/URL logging removed. System/background notification payloads remain a server-side rollout dependency.

## 6. Tests passed
27 isolated rules/transport tests via `bun run test:otp`; no real network transport. Mocked browser flow: pending → assigned Start → started Completion, rating hide/reveal, reassignment, completion, cancellation, unavailable response and legacy sharing control, at phone/desktop widths. No fixture runtime errors or horizontal overflow. Preview compilation passed.

## 7. Tests not run
Real Firebase-to-gateway authentication and ownership, actual gateway deployment, real Start verification from Worker App, canonical generation/status coordination, authenticated customer full-screen flows, native iOS/Android background/foreground cycles and system push delivery. Browser fixture tests shared rendering/rules, not a signed-in production account. No live OTP V2 request, booking or payment was made.

## 8. Remaining external dependencies
Admin gateway deployment and safe server-side credential issuance/enforcement. Server must ensure Completion response only after verified Start, not merely a status change. Canonical booking reads need synchronized mode/assignment generation/status and must not expose V2 credentials outside the retrieval gateway. Worker App must verify Start and Completion correctly and define reassignment behavior. Remove OTPs from server-produced push bodies/data and ensure backend request/error logs never include credentials. Existing Booking Details uses owned-bookings list (up to 200); a server-authorized single-booking read is needed for older records beyond that limit.

## 9. Rollout verdict
Source-only implementation and mocked checks complete; NOT READY FOR PRODUCTION ENABLEMENT. Keep gateway calls, issuance and enforcement OFF until coordinated backend/Worker App deployment and signed-in/native acceptance tests. No migrations, secrets, deployments, publishing or backend business logic changes made.