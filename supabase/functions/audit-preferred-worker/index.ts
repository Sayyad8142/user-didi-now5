/**
 * TEMPORARY probe: does bookings.preferred_worker_id persist?
 * Read-only by default; POST {"action":"test_insert"} creates a scheduled
 * test booking (no worker FCM), reads it back, then deletes it.
 * Delete this function after the audit.
 */
import { getExternalSupabase } from "../_shared/capacityRules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({} as any));
  const db = getExternalSupabase();
  const out: Record<string, unknown> = {};

  if (body.action === "test_insert") {
    const userId = "e1aeaa32-9a86-4f01-b45e-d7f20ddae167";
    const workerId = body.worker_id ?? "24a67a10-cefe-4be0-a593-cac0a1352739";
    const { data: prof } = await db
      .from("profiles")
      .select("id,full_name,phone,community,flat_no,flat_size")
      .eq("id", userId)
      .maybeSingle();
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    const row: Record<string, unknown> = {
      user_id: userId,
      service_type: "maid",
      booking_type: "scheduled",
      scheduled_date: tomorrow,
      scheduled_time: "11:00:00",
      status: "pending",
      price_inr: 1,
      base_price_inr: 1,
      cust_name: prof?.full_name ?? "QA Test",
      cust_phone: prof?.phone ?? "+910000000000",
      community: prof?.community ?? "prestige-high-fields",
      flat_no: prof?.flat_no ?? "101",
      flat_size: prof?.flat_size ?? "2BHK",
      payment_method: "wallet",
      payment_status: "pending",
      preferred_worker_id: workerId,
      is_demo: true,
    };
    const ins = await db.from("bookings").insert([row]).select("id").single();
    out.insert_error = ins.error?.message ?? null;
    if (ins.data?.id) {
      const readBack = await db
        .from("bookings")
        .select("id,status,booking_type,preferred_worker_id,worker_id,service_type,community")
        .eq("id", ins.data.id)
        .single();
      out.booking_row = readBack.error ? readBack.error.message : readBack.data;
      const w = await db.from("workers").select("id,full_name").eq("id", workerId).maybeSingle();
      out.selected_worker = w.data;
      const del = await db.from("bookings").delete().eq("id", ins.data.id);
      out.cleanup_error = del.error?.message ?? null;
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  {
    const { count, error } = await db.from("bookings").select("id", { count: "exact", head: true });
    out.total_bookings = error ? error.message : count;
  }
  {
    const { count, error } = await db
      .from("bookings").select("id", { count: "exact", head: true })
      .not("preferred_worker_id", "is", null);
    out.with_preferred = error ? error.message : count;
  }
  {
    const { data, error } = await db
      .from("bookings")
      .select("id,created_at,status,booking_type,service_type,worker_id,preferred_worker_id,payment_method")
      .order("created_at", { ascending: false })
      .limit(8);
    out.recent = error ? error.message : data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
