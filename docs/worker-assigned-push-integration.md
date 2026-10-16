# Worker Assigned push — backend integration (Worker App / Admin owned)

Worker assignment is written by the Worker App (accept) and Admin Panel (manual assign / reassignment completion), not by the User App. Each of those confirmed-assignment writes must, AFTER the DB update succeeds, POST to Lovable Cloud `send-user-fcm`:

```json
{
  "user_ids": ["<bookings.user_id (profiles.id)>"],
  "title": "✅ Didi Now – Worker Assigned!",
  "body": "Your worker <name> has been assigned to your booking. 🔐 Tap to view your OTP in the app.",
  "data": { "booking_id": "<id>", "status": "assigned", "deep_link": "/booking/<id>", "dedupe_key": "assigned:<booking_id>:<worker_id>:<assigned_at>" }
}
```

Rules
- NEVER put the OTP in title, body, data, URL or logs (lock-screen exposure). The customer sees it in Booking Details via the authenticated bookings-read flow.
- Skip when booking status is `cancelled`.
- Dedupe on `dedupe_key` (one push per assignment event); reassignment yields a new key.
- Legacy trigger `notify_user_booking_push` embeds `completion_otp` in the body — remove that before enabling it.
