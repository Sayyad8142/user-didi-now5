# OTP V2 customer integration
- [x] Add disabled-by-default gateway client and shared, ephemeral OTP lifecycle.
- [x] Integrate Home, booking cards/details and sharing safety; preserve legacy.
- [x] Run isolated contract/lifecycle tests and mocked browser checks.
- [x] Document coordinated-rollout dependencies; no deployments or live V2 calls.
# Customer booking security remediation
- [x] Remove direct customer writes to bookings (pay-worker sheet, failed mark, reach fallback).
- [x] Server function for pay-after-service switch; 3 checkout screens use it.
- [x] Write live-rules check, column guard and rollback SQL (docs/security-remediation-phase1.sql).
- [ ] Owner runs SQL section 1, then section 2/3 after the new app build ships (blocked: owner runs production SQL).
- [ ] Secure 4-digit OTP generation (blocked: Worker App must accept 4 digits).
- [ ] Start OTP + protected OTP storage (blocked: Worker App/Admin coordinated rollout).
