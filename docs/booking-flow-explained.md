# Booking Flow Documentation

## Overview
This document explains the complete booking flow from frontend user interaction to backend processing, covering both "Book Now" (instant) and "Schedule Later" bookings.

---

## 1. Frontend User Journey

### Step 1: Service Selection (Home Screen)
**File:** `src/features/home/HomeScreen.tsx`

```
User lands on Home → Sees ServicesRow component
├── Maid Service
├── Cook Service  
└── Bathroom Cleaning
```

When user clicks a service:
```javascript
handleServiceSelect(service) → navigate(`/book/${service}`)
```

**Route:** `/book/:service_type` (e.g., `/book/maid`, `/book/cook`)

---

### Step 2: Booking Form (Service Details)
**File:** `src/features/booking/BookingForm.tsx`

User fills in service-specific details:

#### For Maid Service:
- Select flat size (2BHK, 3BHK, etc.)
- Select tasks (Floor Cleaning, Dish Washing)
- Price calculated from `maid_pricing_tasks` table

#### For Cook Service:
- Family count (1-10 people)
- Food preference (Veg/Non-Veg)
- Cuisine preference (North/South/Any)
- Gender preference (Male/Female/Any)
- Price calculated: `base_price + (family_count-1)*20 + (non_veg ? 50 : 0)`

#### For Bathroom Cleaning:
- Number of bathrooms
- Price calculated: `unit_price * bathroom_count`

---

### Step 3: Booking Type Selection

User has two options:

#### Option A: Book Now (Instant Booking)
**Function:** `handleBookNow()` in `BookingForm.tsx` (line 176)

Flow:
```javascript
1. Validate inputs (flat size, preferences, etc.)
2. Calculate final price
3. Call createBooking('instant', null, null, price)
```

#### Option B: Schedule Later
**Function:** `handleSchedule()` in `BookingForm.tsx` (line 215)

Flow:
```javascript
1. Validate inputs
2. Build query parameters with booking details
3. Navigate to: `/schedule/${service_type}?flat=2BHK&price=150&...`
```

---

### Step 4: Schedule Screen (Only for Scheduled Bookings)
**File:** `src/features/booking/ScheduleScreen.tsx`

User selects:
1. **Date:** Next 7 days (uses `getDateChips()` from `slot-utils.ts`)
2. **Time Segment:** Morning (6-12), Afternoon (12-5), Evening (5-7)
3. **Time Slot:** 15-minute intervals within selected segment

**Time slot generation:**
```javascript
makeSlots('06:00', '11:45', 15) // Morning slots
makeSlots('12:00', '16:45', 15) // Afternoon slots  
makeSlots('17:00', '19:00', 15) // Evening slots
```

**Extra charges:** ₹5 added for slots after 4:00 PM

**Slot validation:** Past slots are disabled using `isPastToday()`

When user confirms:
```javascript
handleConfirmSchedule() → Calls supabase.from('bookings').insert([bookingData])
```

---

## 2. Backend Processing

### Database Insert
**Table:** `bookings`

**Booking data structure:**
```javascript
{
  user_id: uuid,                    // From auth
  service_type: 'maid'|'cook'|'bathroom_cleaning',
  booking_type: 'instant'|'scheduled',
  scheduled_date: 'YYYY-MM-DD',     // null for instant
  scheduled_time: 'HH:MM:SS',       // null for instant
  status: 'pending',                // Initial status
  flat_size: '2BHK',               // null for cook/bathroom
  price_inr: 150,                   // Calculated price
  
  // Service-specific fields
  family_count: 3,                  // Cook only
  food_pref: 'veg'|'non_veg',      // Cook only
  cook_cuisine_pref: 'north'|'south'|'any',
  cook_gender_pref: 'male'|'female'|'any',
  maid_tasks: ['floor_cleaning', 'dish_washing'],
  bathroom_count: 2,                // Bathroom cleaning only
  
  // Customer info (from profile)
  cust_name: 'John Doe',
  cust_phone: '+919876543210',
  community: 'Green Valley',
  flat_no: 'A-101',
  
  created_at: timestamp,
  updated_at: timestamp
}
```

---

### Database Triggers (Automatic Backend Processing)

#### Trigger 1: Update Timestamps
**Migration:** `20250814153729_fede8639-889d-41bc-9116-3f2852fa4e97.sql`

```sql
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```
**Purpose:** Automatically updates `updated_at` field on any booking modification.

---

#### Trigger 2: Calculate Cancellation Window
**Migration:** `20250820085517_b0cc8df8-4366-4795-bdb4-bdc4eec831dd.sql`

```sql
CREATE TRIGGER trg_bookings_can_cancel
BEFORE INSERT OR UPDATE OF booking_type, scheduled_date, scheduled_time, created_at
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public._recompute_can_cancel_until();
```

**Purpose:** Sets `can_cancel_until` timestamp based on booking type:
- **Instant bookings:** Can cancel until now (immediate)
- **Scheduled bookings:** Can cancel until 2 hours before scheduled time

---

#### Trigger 3: Telegram Notification
**Migration:** `20251008225613_f6ea6929-32cb-4787-836a-a77b1fff4217.sql`

```sql
CREATE TRIGGER trigger_telegram_new_booking
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_telegram_new_booking();
```

**Purpose:** Sends Telegram notification to admin group when new booking is created.

**Edge Function:** `supabase/functions/new-booking-telegram/index.ts`

Notification format:
```
🆕 NEW BOOKING ALERT
Service: maid
Type: instant
Community: Green Valley
Flat: A-101
Price: ₹150
Customer: John Doe (+919876543210)
Booking ID: 550e8400-e29b-41d4-a716-446655440000
```

---

## 3. Booking Status Flow

### Status Progression

```
pending → assigned → accepted → on_the_way → started → completed
    ↓
 cancelled (can happen at any stage before completed)
```

### Status Definitions

| Status | Description | Who Changes It |
|--------|-------------|----------------|
| `pending` | Booking created, waiting for worker assignment | System (initial) |
| `assigned` | Worker assigned to booking | Admin |
| `accepted` | Worker accepted the booking | Worker |
| `on_the_way` | Worker on the way to location | Worker |
| `started` | Worker started the service | Worker |
| `completed` | Service completed | Worker/Admin |
| `cancelled` | Booking cancelled | User/Admin |

---

### Status Change Logic

#### Admin Assignment (pending → assigned)
**File:** `src/features/admin/AssignWorkerModal.tsx` or `AssignWorkerSheet.tsx`

```javascript
// Admin selects worker and assigns
await supabase
  .from('bookings')
  .update({ 
    status: 'assigned',
    worker_id: selectedWorkerId,
    assigned_at: new Date().toISOString()
  })
  .eq('id', bookingId);
```

#### User Cancellation
**File:** `src/features/bookings/CancelAction.tsx`

Can cancel if:
- Status is `pending` or `assigned`
- Current time < `can_cancel_until` timestamp

```javascript
await supabase.rpc('user_cancel_booking', {
  p_booking_id: bookingId,
  p_reason: reason
});
```

---

## 4. Real-time Updates

### Frontend Realtime Subscriptions

#### User Booking Updates
**File:** `src/features/bookings/useBookingRealtime.ts`

```javascript
supabase
  .channel('my-bookings')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'bookings' },
    handleChange
  )
  .subscribe();
```

Users see live updates when:
- Booking status changes (pending → assigned)
- Worker is assigned
- Booking is cancelled by admin

#### Admin Dashboard Updates  
**File:** `src/features/admin/useRealtime.ts`

```javascript
supabase
  .channel('bookings-live')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'bookings' },
    onInsert
  )
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'bookings' },
    onUpdate
  )
  .subscribe();
```

Admins see:
- New bookings appear instantly
- Status changes in real-time
- Assignment updates

---

## 5. Key Differences: Book Now vs Schedule

| Feature | Book Now (Instant) | Schedule Later |
|---------|-------------------|----------------|
| `booking_type` | `'instant'` | `'scheduled'` |
| `scheduled_date` | `null` | Date selected by user |
| `scheduled_time` | `null` | Time slot selected by user |
| Initial Status | `pending` | `pending` |
| Expected ETA | ~10 minutes | As per scheduled time |
| Cancellation Window | Can cancel immediately | Can cancel until 2 hours before |
| Price | Standard price | May have +₹5 after 4 PM |
| UI Flow | Direct to BookingForm → Submit | BookingForm → ScheduleScreen → Submit |

---

## 6. Pricing Logic

### Maid Service
**Table:** `maid_pricing_tasks`

```javascript
// Task-based pricing with community overrides
const totalPrice = selectedTasks.reduce((sum, task) => {
  const price = taskPrices.get(task); // From DB
  return sum + price;
}, 0);

// Example: Floor Cleaning (₹100) + Dish Washing (₹80) = ₹180
```

### Cook Service
**Table:** `cook_pricing_settings`

```javascript
function calculateCookPrice(familyCount, foodPref) {
  const base = 200;                           // Base price
  const addonNonVeg = (foodPref === 'non_veg') ? 50 : 0;
  const addonPeople = Math.max(0, familyCount - 1) * 20;
  
  return base + addonNonVeg + addonPeople;
}

// Example: 
// 4 people, non-veg = 200 + 50 + (3*20) = ₹310
// 2 people, veg = 200 + 0 + (1*20) = ₹220
```

### Bathroom Cleaning
**Table:** `bathroom_pricing_settings`

```javascript
const totalPrice = unitPrice * bathroomCount;

// Example: ₹250/bathroom × 3 bathrooms = ₹750
```

### Other Services (like full house cleaning)
**Table:** `pricing`

```javascript
// Flat size based pricing with community overrides
const price = pricingMap[selectedFlatSize];

// Example: 3BHK in "Green Valley" = ₹500
```

---

## 7. RLS (Row Level Security) Policies

### Users Can:
- **INSERT:** Own bookings only (`user_id = auth.uid()`)
- **SELECT:** Own bookings only
- **UPDATE:** Own bookings only (for cancellation)

### Admins Can:
- **SELECT:** All bookings
- **UPDATE:** All bookings
- **DELETE:** Not allowed (soft delete via status)

### Workers Can:
- **SELECT:** 
  - Assigned bookings (`worker_id = auth.uid()`)
  - Pending bookings matching their service types & communities
- **UPDATE:** Own assigned bookings (status changes)

---

## 8. Testing Checklist

### Book Now Flow
- [ ] User can select service from home
- [ ] User fills service details correctly
- [ ] Price calculates correctly
- [ ] "Book Now" creates booking with `booking_type='instant'`
- [ ] Status is initially `'pending'`
- [ ] Telegram notification sent to admin
- [ ] User redirected to /home with success toast
- [ ] Booking appears in user's "My Bookings"

### Schedule Later Flow
- [ ] User navigates to schedule screen with correct params
- [ ] Date chips show next 7 days
- [ ] Time slots generate correctly for each segment
- [ ] Past slots are disabled
- [ ] Extra ₹5 charge shown for 4 PM+ slots
- [ ] "Confirm Schedule" creates booking with date/time
- [ ] `booking_type='scheduled'`
- [ ] User redirected with success toast

### Real-time Updates
- [ ] Admin sees new booking instantly
- [ ] User sees status changes in real-time
- [ ] Worker assignment updates immediately

### Cancellation
- [ ] User can cancel pending/assigned bookings
- [ ] Can't cancel if past `can_cancel_until` time
- [ ] Status changes to `'cancelled'`
- [ ] Cancel reason saved

---

## 9. Common Issues & Solutions

### Issue: Price not loading
**Cause:** Missing pricing data for community/flat size
**Solution:** Check `pricing` / `maid_pricing_tasks` / `cook_pricing_settings` tables

### Issue: Booking not showing in admin dashboard
**Cause:** RLS policy or realtime subscription issue
**Solution:** Verify `is_admin()` function and realtime subscription

### Issue: Time slots not appearing
**Cause:** Time slot generation or past time filtering
**Solution:** Check `makeSlots()` and `isPastToday()` functions

### Issue: Can't cancel booking
**Cause:** `can_cancel_until` timestamp passed
**Solution:** Check booking time and cancellation window logic

---

## 10. Database Schema Reference

### Key Tables

```sql
-- Main booking table
bookings (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  worker_id uuid,
  service_type text,
  booking_type text, -- 'instant' | 'scheduled'
  status text,       -- 'pending' | 'assigned' | 'accepted' | ...
  scheduled_date date,
  scheduled_time time,
  price_inr integer,
  flat_size text,
  family_count integer,
  food_pref text,
  maid_tasks text[],
  bathroom_count integer,
  community text,
  flat_no text,
  cust_name text,
  cust_phone text,
  can_cancel_until timestamp,
  created_at timestamp,
  updated_at timestamp
)

-- Pricing tables
pricing (service_type, flat_size, community, price_inr, active)
maid_pricing_tasks (task, flat_size, community, price_inr, active)
cook_pricing_settings (community, base_price_inr, non_veg_extra_inr, per_extra_person_inr)
bathroom_pricing_settings (community, unit_price_inr)

-- Worker assignment
booking_assignments (booking_id, worker_id, status, assignment_order)
workers (id, service_types, communities, is_active)
```

---

## Summary

**Book Now Flow:**
```
Home → Select Service → Fill Details → Book Now → DB Insert → Telegram Alert → Home (Success)
```

**Schedule Later Flow:**
```
Home → Select Service → Fill Details → Schedule → Pick Date/Time → Confirm → DB Insert → Telegram Alert → Home (Success)
```

**Backend Processing:**
1. Booking inserted into `bookings` table
2. Triggers fire: `update_at`, `can_cancel_until`, `telegram_notification`
3. Status = `pending`
4. Admin receives Telegram notification
5. Real-time updates push to all subscribed clients
6. Admin assigns worker → Status changes to `assigned`
7. Worker accepts → Status progresses through workflow
8. Service completed → Status = `completed`
9. User can rate worker via `worker_ratings` table
