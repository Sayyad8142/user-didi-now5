/**
 * Shared slot-surge validation logic.
 * Ensures the price paid reflects the slot-time adjustment configured by admins.
 */

export interface SlotSurgeValidation {
  ok: boolean;
  expectedSurge: number;
  clientSurge: number;
  reason?: string;
}

/**
 * Fetches the authoritative slot-surge amount from the DB for a given context.
 * Uses community_id (UUID) and service_key.
 */
// deno-lint-ignore no-explicit-any
export async function getExpectedSlotSurge(
  supabase: any,
  communityId: string | null | undefined,
  serviceKey: string,
  timeSlot: string // HH:MM or HH:MM:SS
): Promise<number> {
  if (!communityId || !timeSlot) return 0;

  // Normalize time to HH:MM:00
  const normalizedTime = timeSlot.includes(':') && timeSlot.split(':').length === 2
    ? timeSlot + ':00'
    : timeSlot;

  try {
    const { data, error } = await supabase
      .from("slot_surge_pricing")
      .select("surge_amount")
      .eq("community_id", communityId)
      .eq("service_key", serviceKey)
      .eq("slot_time", normalizedTime)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.warn("[slotSurge] DB lookup failed:", error.message);
      return 0;
    }

    return data?.surge_amount ?? 0;
  } catch (e) {
    console.warn("[slotSurge] Exception during lookup:", (e as Error).message);
    return 0;
  }
}

/**
 * Validates that the client-submitted price correctly includes the slot surge.
 */
export function validateSlotSurge(
  bookingData: Record<string, unknown>,
  expectedSlotSurge: number
): SlotSurgeValidation {
  const clientSlotSurge = Number(bookingData.surcharge_amount ?? 0);
  
  // If expected is 0, we generally accept 0. 
  // If client sent a discount (negative), we allow it if the server agrees.
  if (Math.abs(clientSlotSurge - expectedSlotSurge) > 1) {
    return {
      ok: false,
      expectedSurge: expectedSlotSurge,
      clientSurge: clientSlotSurge,
      reason: `Slot surge mismatch: client sent ₹${clientSlotSurge}, server expected ₹${expectedSlotSurge}`,
    };
  }

  return { ok: true, expectedSurge: expectedSlotSurge, clientSurge: clientSlotSurge };
}

/**
 * Defence-in-depth: the client-declared final price must equal
 * base_price_inr + loyalty surge + slot surge (all server-validated by now).
 * Blocks a tampered client that keeps a low price_inr while sending correct surges.
 */
export function validatePriceComposition(
  bookingData: Record<string, unknown>,
  expectedLoyaltySurge: number,
  expectedSlotSurge: number,
): { ok: boolean; expected: number; received: number } {
  const base = Number(bookingData.base_price_inr ?? 0);
  const received = Number(bookingData.price_inr ?? 0);
  // No trustworthy base recorded → skip (legacy bundles).
  if (!base || base <= 0) return { ok: true, expected: received, received };
  const expected = base + expectedLoyaltySurge + expectedSlotSurge;
  return { ok: Math.abs(received - expected) <= 1, expected, received };
}

/**
 * Resolves the slot that an INSTANT booking falls into: the largest active
 * configured slot_time <= current IST time. Mirrors the DB trigger
 * enforce_booking_flat_size_and_price() so the server, the DB and the client
 * all agree on one slot adjustment.
 */
// deno-lint-ignore no-explicit-any
export async function resolveInstantSlotTime(
  supabase: any,
  communityId: string | null | undefined,
  serviceKey: string,
): Promise<string | null> {
  if (!communityId) return null;
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 19); // HH:MM:SS in IST
  try {
    const { data, error } = await supabase
      .from("slot_surge_pricing")
      .select("slot_time")
      .eq("community_id", communityId)
      .eq("service_key", serviceKey)
      .eq("is_active", true)
      .lte("slot_time", nowIst)
      .order("slot_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[slotSurge] instant slot lookup failed:", error.message);
      return null;
    }
    return data?.slot_time ?? null;
  } catch (e) {
    console.warn("[slotSurge] instant slot lookup threw:", (e as Error).message);
    return null;
  }
}

/**
 * Single entry point used by every booking-creating edge function:
 * returns the authoritative slot adjustment (₹, may be negative) for either
 * an instant or a scheduled booking payload.
 */
// deno-lint-ignore no-explicit-any
export async function getExpectedSlotSurgeForBooking(
  supabase: any,
  bookingData: Record<string, unknown>,
): Promise<{ surge: number; slotTime: string | null }> {
  const serviceKey = (bookingData.service_type as string) || "maid";
  const communityId = (bookingData.community_id as string) || null;
  const bookingType = (bookingData.booking_type as string) || "instant";

  const slotTime =
    bookingType === "scheduled"
      ? (bookingData.scheduled_time ? String(bookingData.scheduled_time) : null)
      : await resolveInstantSlotTime(supabase, communityId, serviceKey);

  if (!slotTime) return { surge: 0, slotTime: null };
  const surge = await getExpectedSlotSurge(supabase, communityId, serviceKey, slotTime);
  return { surge, slotTime };
}
