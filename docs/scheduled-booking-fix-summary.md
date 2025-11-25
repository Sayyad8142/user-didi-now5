# Scheduled Booking Alert Fix - Summary

## Problem
Workers were receiving **instant FCM alerts** for scheduled bookings at the time of creation, instead of only receiving alerts **15 minutes before** the scheduled time.

## Root Cause
Multiple database triggers were firing on `INSERT` into the `bookings` table and sending FCM notifications to workers **WITHOUT checking** if `booking_type = 'scheduled'`:

### Triggers That Were Broken:
1. **`enqueue_booking_push()`** - Called `booking-notifications` edge function for ALL pending bookings
2. **`enqueue_booking_push_v1()`** - Sent FCM directly to workers for ALL pending bookings
3. **`notify_workers_on_booking_created()`** - Checked `scheduled_date IS NULL` (wrong logic)
4. **`queue_intelligent_booking_notification()`** - Queued notifications for ALL pending bookings
5. **`trigger_booking_assignment()`** - Initiated assignment for ALL pending bookings

## Solution
Added **`booking_type = 'instant'`** guards to ALL notification triggers so:

- **Instant bookings** → Immediate FCM alerts to workers (existing behavior)
- **Scheduled bookings** → NO alerts at creation time, only via `run_scheduled_prealerts()` 15 minutes before

### Modified Functions:
All 5 trigger functions now check:
```sql
IF NEW.booking_type = 'instant' THEN
  -- Send FCM notifications
END IF;
```

Or skip scheduled bookings:
```sql
IF NEW.booking_type = 'scheduled' THEN
  RETURN NEW;  -- Skip notification
END IF;
```

## Flow Diagram

### Instant Booking Flow
```
User creates instant booking
    ↓
INSERT into bookings (booking_type='instant', status='pending')
    ↓
Triggers fire:
  - enqueue_booking_push()
  - enqueue_booking_push_v1()
  - notify_workers_on_booking_created()
  - queue_intelligent_booking_notification()
  - trigger_booking_assignment()
    ↓
FCM sent to workers immediately
    ↓
Worker overlay shows "BOOKING_ALERT"
    ↓
Worker accepts booking
```

### Scheduled Booking Flow
```
User creates scheduled booking (e.g., tomorrow at 10:00 AM)
    ↓
INSERT into bookings (
  booking_type='scheduled',
  status='pending',
  scheduled_date='2025-11-27',
  scheduled_time='10:00:00',
  prealert_sent=false
)
    ↓
ALL triggers check booking_type and SKIP notification
    ↓
No FCM sent to workers
    ↓
CRON job runs every minute: didinow_prealerts_every_minute
    ↓
At 9:45 AM (15 mins before), run_scheduled_prealerts(15) finds booking
    ↓
send_fcm_to_worker() sends FCM with type="BOOKING_ALERT"
    ↓
Worker overlay shows "BOOKING_ALERT"
    ↓
Worker accepts booking
    ↓
prealert_sent = true (prevents duplicate alerts)
```

## Testing Checklist

### ✅ Instant Booking Test
1. Create booking with `booking_type = 'instant'`
2. **Expected**: Workers receive FCM overlay immediately
3. **Expected**: Admin dashboard plays sound (if enabled)

### ✅ Scheduled Booking - Creation
1. Create booking with `booking_type = 'scheduled'` for 2 hours later
2. **Expected**: Workers receive NO FCM alerts
3. **Expected**: Admin dashboard does NOT play sound
4. **Expected**: Database shows `prealert_sent = false`

### ✅ Scheduled Booking - Pre-alert Window
1. Create booking with `booking_type = 'scheduled'` for 16 minutes from now
2. Wait for cron job to run (runs every minute)
3. After ~1 minute, check database
4. **Expected**: `prealert_sent = true`
5. **Expected**: Workers received FCM with type="BOOKING_ALERT"
6. **Expected**: Worker overlay appeared
7. **Expected**: Admin received Pushcut notification

## Key Files Modified

### Database Functions (Migration)
- `enqueue_booking_push()`
- `enqueue_booking_push_v1()`
- `notify_workers_on_booking_created()`
- `queue_intelligent_booking_notification()`
- `trigger_booking_assignment()`

### Already Correct (No Changes Needed)
- `notify_pushcut_new_booking()` - Already had `IF NEW.booking_type = 'scheduled' THEN RETURN NEW;`
- `notify_telegram_new_booking()` - Already had booking_type check
- `new-booking-telegram` edge function - Already filtered scheduled bookings
- `useNewBookingAlert.ts` (admin frontend) - Already filtered `bookingType === 'instant'`
- `ScheduleScreen.tsx` - Only inserts to DB, doesn't call any notification functions

## CRON Configuration

```sql
SELECT cron.schedule(
  'didinow_prealerts_every_minute',
  '* * * * *',  -- Every minute
  $$SELECT public.run_scheduled_prealerts(15);$$
);
```

## Important Notes

1. **`run_scheduled_prealerts(15)`** is the ONLY path that should send FCM for scheduled bookings
2. The function checks for bookings where `scheduled_ts BETWEEN now() AND now() + 15 minutes`
3. Uses Asia/Kolkata timezone for scheduled time calculations
4. Sets `prealert_sent = true` to prevent duplicate alerts
5. Sends same FCM payload (`BOOKING_ALERT`) as instant bookings, only timing differs

## Migration Applied
- **File**: `supabase/migrations/[timestamp]_fix_scheduled_booking_alerts.sql`
- **Date**: 2025-11-25
- **Status**: ✅ Successfully Applied
