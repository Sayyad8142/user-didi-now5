/**
 * Server-side authorization for the "Choose your favorite worker" feature.
 *
 * A client may only request a preferred worker the customer has actually
 * completed a booking with, for the same service + community. Anything else
 * is silently dropped (booking proceeds with normal dispatch) so a client can
 * never forge arbitrary worker targeting.
 */
export async function sanitizePreferredWorkerId(
  supabase: any,
  args: {
    requested: unknown;
    userId: string;
    serviceType: string;
    community: string | null | undefined;
  },
): Promise<{ preferredWorkerId: string | null; rejected: boolean; reason?: string }> {
  const requested = typeof args.requested === "string" ? args.requested.trim() : "";
  if (!requested) return { preferredWorkerId: null, rejected: false };

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(requested)) {
    return { preferredWorkerId: null, rejected: true, reason: "not_a_uuid" };
  }

  // Authoritative check: completed booking history for this customer.
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", args.userId)
    .eq("worker_id", requested)
    .eq("service_type", args.serviceType)
    .eq("status", "completed")
    .limit(1);

  if (error) {
    console.warn(
      `[preferredWorker] eligibility check failed (${error.message}) — dropping preferred_worker_id`,
    );
    return { preferredWorkerId: null, rejected: true, reason: "check_failed" };
  }

  if (!data || data.length === 0) {
    return { preferredWorkerId: null, rejected: true, reason: "no_completed_history" };
  }

  // Worker must still exist and serve this service/community.
  const { data: worker, error: wErr } = await supabase
    .from("workers")
    .select("id,is_active,service_types,communities")
    .eq("id", requested)
    .maybeSingle();

  if (wErr || !worker || worker.is_active === false) {
    return { preferredWorkerId: null, rejected: true, reason: "worker_unavailable" };
  }
  const services: string[] | null = worker.service_types ?? null;
  if (services && services.length > 0 && !services.includes(args.serviceType)) {
    return { preferredWorkerId: null, rejected: true, reason: "service_mismatch" };
  }
  const communities: string[] | null = worker.communities ?? null;
  if (
    args.community && communities && communities.length > 0 &&
    !communities.includes(args.community)
  ) {
    return { preferredWorkerId: null, rejected: true, reason: "community_mismatch" };
  }

  return { preferredWorkerId: requested, rejected: false };
}
