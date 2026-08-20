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
