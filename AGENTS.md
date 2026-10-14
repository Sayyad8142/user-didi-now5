# Architecture rules
- Customer booking OTPs use a shared in-memory lifecycle and presentation; never store gateway credentials in booking-query caches, logs, URLs or analytics.
- The OTP V2 gateway transport is disabled by default until coordinated deployment; explicit V2 bookings fail closed and never use a legacy credential.
- Booking Details reads through the Firebase-authenticated bookings-read client, not anonymous direct booking-table queries, because customer identity is Firebase.
- OTP integration tests use injected transports and mocked booking responses; they never create production bookings or call the undeployed V2 gateway.