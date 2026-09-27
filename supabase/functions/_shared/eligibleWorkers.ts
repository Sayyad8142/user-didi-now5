/**
 * CANONICAL "available right now" count.
 * Source of truth = production RPC `get_dispatch_eligible_worker_count`
 * (same rule dispatch-pending-bookings uses). p_day/p_slot null → backend
 * resolves the current IST weekday and half-hour slot. No rules duplicated here.
 */
// deno-lint-ignore no-explicit-any
type Client = any;

export async function getDispatchEligibleCount(
  sb: Client,
  community: string,
  service: string,
): Promise<number> {
  const { data, error } = await sb.rpc("get_dispatch_eligible_worker_count", {
    p_service: service,
    p_community: community,
    p_day: null,
    p_slot: null,
  });
  if (error) throw error;
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}
