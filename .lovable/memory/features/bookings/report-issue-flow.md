---
name: Booking Issues Reporting
description: Report Issue button on active booking cards inserts into booking_issues with one-per-booking guard and admin realtime.
type: feature
---
Users can report problems with an assigned worker (e.g., proxy worker, unreachable, asked extra money) directly from active booking cards. The "Report Issue" button is shown by `ReportIssueButton` (`src/features/bookings/ReportIssueSheet.tsx`) on `ActiveBookingCard` (home) and `BookingCard` (bookings list) only when:

- `status` ∈ {`assigned`, `accepted`, `on_the_way`, `started`}
- A worker is assigned (`worker_id` present)
- Booking is not cancelled/completed

Tapping opens a bottom sheet with 5 radio options:
- `assigned_worker_not_came`
- `different_person_came` (shows safety warning: "For your safety, please do not allow unknown workers.")
- `worker_unreachable`
- `worker_asked_extra_money`
- `other` (requires free-text description, max 200 chars)

Submission inserts into `public.booking_issues` (`booking_id`, `user_id` = profile.id, `worker_id`, `issue_type`, `issue_description`, `status='open'`). A unique index on `booking_id` prevents duplicate complaints; the UI checks presence on mount and disables the button as "Issue Reported" if one already exists. Realtime is enabled on `booking_issues` so the admin panel updates instantly.

Migration SQL lives at `docs/booking-issues-migration.sql` and must be run on the **external Supabase** (`api.didisnow.com`) — Lovable AI cannot execute DDL there. Includes RLS (users read/insert their own via `profiles.firebase_uid` mapping; service role full access) and an optional commented-out Telegram alert trigger.
