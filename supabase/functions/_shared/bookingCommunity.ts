/** Resolve the worker-availability key from the authoritative community row. */
export async function resolveBookingCommunity(
  supabase: any,
  bookingData: Record<string, unknown>,
): Promise<string | null> {
  const communityId = String(bookingData.community_id ?? "").trim();
  const clientCommunity = String(bookingData.community ?? "").trim();

  if (!communityId) return clientCommunity || null;

  const { data, error } = await supabase
    .from("communities")
    .select("value")
    .eq("id", communityId)
    .maybeSingle();

  if (error) {
    console.warn(
      `[bookingCommunity] lookup failed community_id=${communityId}: ${error.message}`,
    );
    return clientCommunity || null;
  }

  const value = String(data?.value ?? "").trim();
  return value || clientCommunity || null;
}