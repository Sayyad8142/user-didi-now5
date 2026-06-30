
## Per-User Dynamic Pricing — Spec

Surge is **per individual user**, based on how many bookings that user has placed so far. Applies to **all services** (Maid + Bathroom) and **both instant + scheduled**.

### Tier table

| User's booking number | Extra charge |
|---|---|
| 1st, 2nd, 3rd | ₹0 (base) |
| 4th, 5th, 6th | +₹10 |
| 7th, 8th, 9th, 10th | +₹30 |
| 11th and beyond | +₹60 |

"Booking number" = count of the user's bookings that are **not cancelled** (pending, assigned, in-progress, completed all count). The booking currently being placed is the (count + 1)th.

### Where it applies

1. **Price display** — Booking form, slot picker, instant checkout, schedule sheet, price chart sheet all show `base + user_surge` for the logged-in user. Guests see base price only.
2. **Server-side enforcement** — `create-paid-booking`, `create-pending-booking`, and `create-razorpay-order` edge functions recompute the user's tier from the external DB and reject if the client-submitted price is lower than expected. This blocks tampering.
3. **Transparency** — A small inline note under the price: "Loyalty pricing: +₹10 (your 5th booking)" so the user understands the change. Not a surprise.

### What gets built

**Backend (external DB — SQL written to `docs/`)**
- `get_user_surge_amount(user_uuid)` RPC: counts user's non-cancelled bookings, returns surge ₹.
- Used by edge functions for validation.

**Frontend**
- `src/lib/userSurge.ts` — pure function `computeUserSurge(bookingCount)` returning `{ amount, tier, nextThreshold }`.
- `src/hooks/useUserSurge.ts` — fetches current user's booking count (cached 60s, invalidated after each booking).
- Integrated into:
  - `InstantCheckoutScreen.tsx` (price + button amount)
  - `ScheduleScreen.tsx` / `ScheduleSheet.tsx`
  - `BookingForm.tsx`
  - `MaidPriceChartSheet.tsx` (shows tier hint)
  - `PriceNote.tsx` (inline transparency line)

**Edge functions**
- `create-paid-booking/index.ts`: recompute surge server-side, reject mismatched amount.
- `create-pending-booking` and `create-razorpay-order`: same guard.

**Admin override (optional, future)** — tiers hardcoded in shared util for now. If you later want admin-tunable tiers, we add an `app_config.surge_tiers` JSONB column.

### Edge cases handled

- **Guest users**: no surge (no user_id → tier 1).
- **Failed/cancelled bookings**: excluded from count, so a user isn't punished for a system cancel.
- **Slot surge stacking**: existing `slot_surge_pricing` (per-slot ₹ uplift) still applies — final price = `base + slot_surge + user_surge`.
- **Wallet flow**: surge added before wallet deduction.

### One open question

After tier 4 (11+ bookings), do you want it to **stay flat at +₹60 forever**, or **keep adding +₹30 per tier of 4** (15+ = ₹90, 19+ = ₹120, etc.)?

I'll default to **flat +₹60 forever** unless you say otherwise — say "keep climbing" if you want the laddered version.

---

Approve this plan and I'll ship it in one pass: SQL doc + edge function guards + hook + UI integration + transparency line.
