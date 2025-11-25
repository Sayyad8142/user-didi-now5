# Scheduled Booking Notification Flow

## Overview
This document explains how booking notifications are handled differently for **instant** vs **scheduled** bookings.

## Critical Rule
**Workers should ONLY be notified 15 minutes before a scheduled booking's scheduled time, NOT when the booking is created.**

---

## 1. Instant Booking Flow (booking_type = 'instant')

### When User Creates Instant Booking:
1. Booking inserted into `bookings` table with `status = 'pending'` and `booking_type = 'instant'`

### Immediate Notifications (< 1 second after insert):
2. **Database Trigger**: `notify_pushcut_new_booking()` fires
   - ✅ Checks `booking_type = 'instant'`
   - ✅ Sends Pushcut notification to admin
   - Location: `supabase/migrations/20251122232112_*.sql`

3. **Database Trigger**: `notify_telegram_new_booking()` fires
   - ✅ Checks `booking_type = 'instant'`
   - ✅ Calls `/functions/v1/new-booking-telegram` edge function
   - Location: `supabase/migrations/[latest]_*.sql`

4. **Edge Function**: `new-booking-telegram`
   - ✅ Double-checks `booking_type = 'instant'`
   - ✅ Sends Telegram message
   - Location: `supabase/functions/new-booking-telegram/index.ts`

5. **Frontend Realtime**: Admin dashboard sound alert
   - ✅ Checks `booking_type = 'instant'` AND `status = 'pending'`
   - ✅ Plays ding.mp3 sound
   - Location: `src/features/admin/useNewBookingAlert.ts`

### Result:
- Workers get instant alerts via Pushcut/Telegram
- Admin hears sound alert
- Worker can accept booking immediately

---

## 2. Scheduled Booking Flow (booking_type = 'scheduled')

### When User Creates Scheduled Booking:
1. Booking inserted into `bookings` table with:
   - `status = 'pending'`
   - `booking_type = 'scheduled'`
   - `scheduled_date` = future date
   - `scheduled_time` = specific time
   - `prealert_sent = false`

### NO Immediate Notifications:
2. **Database Trigger**: `notify_pushcut_new_booking()` fires
   - ✅ Checks `booking_type = 'scheduled'`
   - ✅ **RETURNS without sending notification**
   - Location: `supabase/migrations/20251122232112_*.sql`

3. **Database Trigger**: `notify_telegram_new_booking()` fires
   - ✅ Checks `booking_type = 'scheduled'`
   - ✅ **RETURNS without calling edge function**
   - Location: `supabase/migrations/[latest]_*.sql`

4. **Frontend Realtime**: Admin dashboard sound alert
   - ✅ Checks `booking_type = 'scheduled'`
   - ✅ **Does NOT play sound**
   - ✅ Logs: "Scheduled booking detected - skipping alert"
   - Location: `src/features/admin/useNewBookingAlert.ts`

### CRON Job (runs every 1 minute):
5. **Edge Function**: `scheduled-dispatch`
   - Calls `run_scheduled_prealerts(15)` every minute
   - Location: `supabase/functions/scheduled-dispatch/index.ts`

6. **Database Function**: `run_scheduled_prealerts(p_window_minutes)`
   - Finds all scheduled bookings where:
     ```sql
     booking_type = 'scheduled'
     AND status = 'pending'
     AND prealert_sent = false
     AND scheduled_datetime BETWEEN now() AND now() + interval '15 minutes'
     ```
   - For each matching booking:
     - Sends Pushcut notification
     - Sets `prealert_sent = true`
   - Location: Database function (see `supabase/migrations`)

### 15 Minutes Before Scheduled Time:
7. Workers receive Pushcut notifications
8. Booking `prealert_sent` is marked `true`
9. Worker can accept booking
10. Normal assignment flow continues

### Result:
- NO notifications when booking is created
- Workers notified ONLY 15 mins before scheduled time
- No false alerts for bookings hours/days away

---

## 3. Notification Path Summary

### ✅ Paths That Check booking_type:

| Component | Location | Checks booking_type? | Action for scheduled |
|-----------|----------|---------------------|---------------------|
| `notify_pushcut_new_booking()` | Database trigger | ✅ YES | Returns early, no notification |
| `notify_telegram_new_booking()` | Database trigger | ✅ YES | Returns early, no edge function call |
| `new-booking-telegram` | Edge function | ✅ YES | Returns early if scheduled |
| `useNewBookingAlert` | Frontend hook | ✅ YES | Does not play sound |
| `run_scheduled_prealerts()` | Database function | ✅ YES | Only processes scheduled bookings |

---

## 4. Testing Checklist

### Test Case A: Instant Booking
1. Create booking with `booking_type = 'instant'`
2. ✅ Expect: Immediate Pushcut notification
3. ✅ Expect: Immediate Telegram notification
4. ✅ Expect: Admin dashboard sound alert
5. ✅ Expect: Worker can accept immediately

### Test Case B: Scheduled Booking (2 hours ahead)
1. Create booking with `booking_type = 'scheduled'`, scheduled_datetime = now() + 2 hours
2. ❌ Expect: NO Pushcut notification
3. ❌ Expect: NO Telegram notification
4. ❌ Expect: NO admin dashboard sound alert
5. ✅ Expect: Booking shows in admin panel as pending
6. ✅ Expect: `prealert_sent = false`

### Test Case C: Scheduled Booking (15 mins ahead)
1. Wait until booking is within 15-minute window
2. ✅ Expect: CRON triggers `run_scheduled_prealerts()`
3. ✅ Expect: Pushcut notification sent
4. ✅ Expect: `prealert_sent = true`
5. ✅ Expect: Worker can accept booking
6. ❌ Expect: NO duplicate notifications on next CRON run

---

## 5. Key Files Modified

### Database (SQL Migrations):
- `supabase/migrations/20251122232112_*.sql` - Fixed Pushcut trigger
- `supabase/migrations/[latest]_*.sql` - Fixed Telegram trigger

### Edge Functions:
- `supabase/functions/new-booking-telegram/index.ts` - Added booking_type check
- `supabase/functions/scheduled-dispatch/index.ts` - Calls prealerts function

### Frontend:
- `src/features/admin/useNewBookingAlert.ts` - Added booking_type check for sound alerts

### Database Functions:
- `run_scheduled_prealerts(p_window_minutes)` - Processes scheduled bookings at correct time

---

## 6. CRON Configuration

The CRON job runs every **1 minute**:

```sql
SELECT cron.schedule(
  'didinow_prealerts_every_minute',
  '* * * * *',  -- Every minute
  $$SELECT public.run_scheduled_prealerts(15);$$
);
```

Location: See database migrations

---

## 7. Common Issues & Debugging

### Issue: Workers still getting instant alerts for scheduled bookings

**Check:**
1. ✅ Database trigger: `notify_pushcut_new_booking()` has booking_type check?
2. ✅ Database trigger: `notify_telegram_new_booking()` has booking_type check?
3. ✅ Edge function: `new-booking-telegram` has booking_type check?
4. ✅ Frontend: `useNewBookingAlert` has booking_type check?
5. ✅ Database function: `run_scheduled_prealerts()` using correct SQL filter?

**Debug:**
- Check Supabase logs for `new-booking-telegram` function
- Check Edge Function logs for `scheduled-dispatch` function
- Check browser console for admin dashboard sound alerts
- Query database: `SELECT * FROM bookings WHERE booking_type = 'scheduled' AND prealert_sent = true;`

### Issue: Scheduled bookings not being notified at all

**Check:**
1. ✅ CRON job is running: Check Supabase dashboard
2. ✅ `run_scheduled_prealerts()` function exists and is correct
3. ✅ Booking has valid `scheduled_date` and `scheduled_time`
4. ✅ Booking `status = 'pending'` and `prealert_sent = false`
5. ✅ Booking is within 15-minute window

**Debug:**
- Check Edge Function logs for `scheduled-dispatch`
- Query: `SELECT * FROM bookings WHERE booking_type = 'scheduled' AND status = 'pending' AND prealert_sent = false;`
- Manually call: `SELECT run_scheduled_prealerts(15);` in SQL editor

---

## 8. Code Comments

All modified files include inline comments explaining:
- Why booking_type is checked
- What happens for instant vs scheduled bookings
- Reference to this document

---

## 9. Future Considerations

- Consider adding a "test notification" button in admin panel
- Consider logging all notification attempts to a `notification_log` table
- Consider adding metrics/analytics for notification delivery times
- Consider adding retry logic for failed notifications

---

## Summary

✅ **Instant bookings**: Get immediate notifications via all channels
❌ **Scheduled bookings**: Get NO notifications on creation
✅ **Scheduled bookings**: Get notifications 15 mins before scheduled time via CRON
✅ **All paths**: Check booking_type to prevent false alerts
