// ============================================================================
// notifyUserPush — fire-and-forget user push helper
// ----------------------------------------------------------------------------
// Booking lifecycle pushes were historically expected from a DB trigger on the
// bookings table (notify_user_booking_push). On the authoritative EXTERNAL
// production DB that trigger does not fire (production logs show booking
// creation with no send-user-fcm invocation), so the edge functions that own
// the booking write now call the working sender explicitly.
//
// Rules:
//  - NEVER throw / never block the booking or cancellation response.
//  - user_id must be profiles.id (the key used by user_fcm_tokens).
//  - Targets send-user-fcm on Lovable Cloud, where it is deployed.
// ============================================================================

const FUNCTIONS_URL =
  Deno.env.get("FUNCTIONS_BASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export async function notifyUserPush(
  userId: string | string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const userIds = (Array.isArray(userId) ? userId : [userId]).filter(Boolean);
    if (userIds.length === 0 || !FUNCTIONS_URL) {
      console.warn("[notifyUserPush] skipped — missing userId or functions URL");
      return;
    }

    const res = await fetch(`${FUNCTIONS_URL}/functions/v1/send-user-fcm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SERVICE_KEY
          ? { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY }
          : {}),
      },
      body: JSON.stringify({ user_ids: userIds, title, body, data }),
    });

    const raw = await res.text();
    console.log(
      `[notifyUserPush] users=${userIds.join(",")} title="${title}" → HTTP ${res.status} ${raw.slice(0, 200)}`,
    );
  } catch (e) {
    console.error("[notifyUserPush] failed (non-blocking):", (e as Error)?.message ?? e);
  }
}
