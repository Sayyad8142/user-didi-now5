/**
 * CANONICAL "available right now" worker pool.
 *
 * Source of truth = production RPC `get_eligible_workers(p_service, p_community)`
 * — the same eligibility pool the dispatcher offers instant bookings to.
 * Heartbeat freshness is returned by that RPC as `is_fresh` (informational
 * only) and is NOT used to exclude workers here, matching dispatch.
 *
 * Every customer-facing count (Home, instant-availability gate) must derive
 * from this function so it stays in sync with dispatch automatically.
 */
// deno-lint-ignore no-explicit-any
type Client = any;

export interface EligiblePool {
  service: string;
  count: number;
  worker_ids: string[];
  // deno-lint-ignore no-explicit-any
  workers: any[];
}

export async function getEligiblePool(
  sb: Client,
  community: string,
  service: string,
): Promise<EligiblePool> {
  const { data, error } = await sb.rpc("get_eligible_workers", {
    p_service: service,
    p_community: community,
  });
  if (error) throw error;
  const rows = (data || []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => String(r.worker_id ?? r.id)).filter(Boolean))];
  return { service, count: ids.length, worker_ids: ids, workers: rows };
}
