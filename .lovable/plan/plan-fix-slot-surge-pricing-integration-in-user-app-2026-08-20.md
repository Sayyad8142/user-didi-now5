# Plan: Fix Slot Surge Pricing Integration in User App

We will implement a robust, server-validated Slot Surge Pricing system for Scheduled Bookings, ensuring customers see accurate pricing adjustments (surcharges or discounts) on the schedule screen and that these adjustments are strictly enforced by the backend.

## User Review Required

> [!IMPORTANT]
> - **External Database Migration**: You MUST apply the SQL provided in `docs/fix-scheduled-slot-surge.sql` to your **External Supabase Database** (api.didisnow.com) SQL Editor. This is critical for server-side enforcement.
> - **Operating Hours**: The system assumes business hours between 7 AM and 7 PM IST (Asia/Kolkata).

## Proposed Changes

### 1. Shared Logic Implementation
- Create `src/lib/slotSurge.ts` to provide unified helpers for formatting and calculating surge values.
- Create `supabase/functions/_shared/slotSurge.ts` for edge function server-side validation.

### 2. UI Updates (Scheduled Booking Screen)
- **Time Slot Display**: Update `src/features/booking/ScheduleScreen.tsx` to:
    - Show "+₹X" (orange) for surcharges and "Save ₹X" (green) for discounts directly on time slot cards.
    - Highlight selected slots with their specific adjustment.
    - Add a "Save more with off-peak slots" tip when discounts are available.
- **Price Breakdown**: Show a clear breakdown (Base Price, Slot Adjustment, Total) before payment.

### 3. Backend Enforcement
- **Edge Function Hardening**: Update `create-paid-booking` and `create-razorpay-order` to:
    - Re-resolve the slot surge amount server-side using the community, service, and scheduled time.
    - Reject any requests where the client-provided price doesn't match the server-expected slot surge.
- **Database Trigger**: Update the `enforce_booking_flat_size_and_price` trigger on the external DB to overwrite `surcharge_amount` and `price_inr` with authoritative values from `slot_surge_pricing`.

### 4. Verification Plan
- **Flow Tests**:
    - Verify Maid/Bathroom Cleaning slots correctly show configured surcharges/discounts.
    - Verify date/service switching refreshes pricing correctly.
- **Safety Checks**:
    - Confirm the final amount in Razorpay and the `bookings` table includes the adjustment.
    - Attempt to "trick" the API by sending a base price without surge to confirm the backend rejects/overwrites it.

## Technical Details

### Database / API Source
- **Table**: `slot_surge_pricing` (columns: `community_id`, `service_key`, `slot_time`, `surge_amount`, `is_active`).
- **Resolver**: The backend will use `community_id` and `scheduled_time` to match records. Time comparison will be normalized to `HH:MM:00`.

### Affected Components
- `src/features/booking/ScheduleScreen.tsx`: Main UI logic.
- `src/lib/paymentService.ts`: Payload sanitization.
- `supabase/functions/create-paid-booking/index.ts`: Transactional enforcement.
- `supabase/functions/create-razorpay-order/index.ts`: Pre-payment amount validation.
