// ============================================================================
// Authoritative server-side validation for scheduled booking slots.
// The client may proceed when its availability allowlist is "unknown", so the
// booking backend must independently validate:
//   1. slot is a real 30-minute boundary ('HH:mm')
//   2. slot is not in the past (Asia/Kolkata) and respects the lead-time buffer
//   3. at least one eligible worker is available for
//      community + service_type + date + slot
// ============================================================================

export const LEAD_TIME_MINUTES = 30;

export type SlotValidation =
  | { ok: true; workerCount: number | null; source: "rpc" | "rpc_unavailable" }
  | { ok: false; code: string; reason: string; workerCount?: number | null };

/** Wall-clock now in Asia/Kolkata, independent of the server's timezone. */
export function istNow(): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

export function normalizeSlot(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23) return null;
  if (min !== 0 && min !== 30) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export async function validateScheduledSlot(
  supabase: any,
  input: {
    community: string | null | undefined;
    service_type: string | null | undefined;
    scheduled_date: string | null | undefined;
    scheduled_time: string | null | undefined;
  },
): Promise<SlotValidation> {
  const slot = normalizeSlot(input.scheduled_time);
  if (!slot) {
    return {
      ok: false,
      code: "SLOT_INVALID_FORMAT",
      reason: `scheduled_time="${input.scheduled_time}" is not a 30-minute slot`,
    };
  }

  const dateKey = String(input.scheduled_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return {
      ok: false,
      code: "SLOT_INVALID_DATE",
      reason: `scheduled_date="${input.scheduled_date}" is not a valid date`,
    };
  }

  // 2. Past / lead-time check in IST
  const now = istNow();
  if (dateKey < now.dateKey) {
    return { ok: false, code: "SLOT_IN_PAST", reason: `${dateKey} is before IST today (${now.dateKey})` };
  }
  if (dateKey === now.dateKey) {
    const [h, m] = slot.split(":").map(Number);
    const slotMinutes = h * 60 + m;
    if (slotMinutes < now.minutes + LEAD_TIME_MINUTES) {
      return {
        ok: false,
        code: "SLOT_IN_PAST",
        reason: `slot ${slot} is inside the ${LEAD_TIME_MINUTES}-min lead time (IST now ${Math.floor(now.minutes / 60)}:${String(now.minutes % 60).padStart(2, "0")})`,
      };
    }
  }

  // 3. Worker availability — service role, so grants on the RPC don't matter.
  if (!input.community || !input.service_type) {
    return {
      ok: false,
      code: "SLOT_MISSING_CONTEXT",
      reason: "community and service_type are required to validate a scheduled slot",
    };
  }

  const { data, error } = await supabase.rpc("get_scheduled_slot_availability", {
    p_community: input.community,
    p_service_type: input.service_type,
    p_date: dateKey,
  });

  if (error) {
    // Fail-open on infrastructure failure (never block a paid booking on a
    // broken RPC) but log loudly for admin monitoring.
    console.error(
      `[scheduledSlot] ⚠️ AVAILABILITY_RPC_FAILED code=${error.code} msg="${error.message}" community=${input.community} service=${input.service_type} date=${dateKey} slot=${slot}`,
    );
    return { ok: true, workerCount: null, source: "rpc_unavailable" };
  }

  const row = ((data as any[]) || []).find(
    (r) => String(r.slot_time).slice(0, 5) === slot,
  );
  const workerCount = row ? Number(row.worker_count) || 0 : 0;

  if (!row) {
    return {
      ok: false,
      code: "SLOT_NOT_OFFERED",
      reason: `${slot} is not a bookable slot for ${input.service_type} on ${dateKey}`,
      workerCount: 0,
    };
  }

  if (workerCount < 1) {
    return {
      ok: false,
      code: "SLOT_SOLD_OUT",
      reason: `no eligible worker for ${input.service_type} at ${slot} on ${dateKey} in ${input.community}`,
      workerCount,
    };
  }

  return { ok: true, workerCount, source: "rpc" };
}
