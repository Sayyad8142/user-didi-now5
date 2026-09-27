// TEMPORARY read-only diagnostic: stage-by-stage worker eligibility breakdown.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform",
};
const clean = (v?: string | null) => (v || "").trim().replace(/^['"]|['"]$/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) || "https://paywwbuqycovjopryele.supabase.co",
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")),
    );
    const body = await req.json().catch(() => ({}));
    const community = body.community || "prestige-high-fields";
    const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const dow = (ist.getDay() + 6) % 7;
    const jsDow = ist.getDay();
    const slot = `${String(ist.getHours()).padStart(2, "0")}:${ist.getMinutes() < 30 ? "00" : "30"}:00`;

    const { data: workers, error } = await sb.from("workers").select("*");
    if (error) throw error;
    const ids = (workers || []).map((w: any) => w.id);
    const { data: avail } = await sb.from("worker_availability").select("*").in("worker_id", ids);
    const { data: busyBookings } = await sb.from("bookings").select("id,worker_id,status,service_type")
      .in("status", ["assigned", "accepted", "confirmed", "on_the_way", "started"]).not("worker_id", "is", null);
    const busyIds = new Set((busyBookings || []).map((b: any) => b.worker_id));
    const { data: rpc } = await sb.rpc("get_online_workers_count", { p_community: community });
    const sample = workers?.[0] ? Object.keys(workers[0]) : [];

    const out: any = { community, ist_now: ist.toISOString().replace("Z", "+05:30"), dow_mon0: dow, js_dow: jsDow, slot, worker_columns: sample, rpc, services: {} };
    for (const service of ["maid", "bathroom_cleaning"]) {
      const s: any = {};
      const inComm = (workers || []).filter((w: any) => (w.communities || []).includes(community) || w.community === community);
      s.total_in_community = inComm.map((w: any) => w.id);
      const svc = inComm.filter((w: any) => (w.service_types || []).includes(service) || w.service_type === service);
      s.service_eligible = svc.map((w: any) => ({ id: w.id, name: w.full_name, service_types: w.service_types, primary: w.service_type }));
      const active = svc.filter((w: any) => w.is_active !== false);
      s.active = active.map((w: any) => w.id);
      const on = active.filter((w: any) => w.is_available === true);
      s.availability_on = on.map((w: any) => w.id);
      const slotOk = on.filter((w: any) => (avail || []).some((a: any) => a.worker_id === w.id && (a.day_of_week === dow || a.day_of_week === jsDow) && (a.slots || []).includes(slot)));
      s.slot_match = slotOk.map((w: any) => w.id);
      s.slot_rows_for_on_workers = on.map((w: any) => ({ id: w.id, days: (avail || []).filter((a: any) => a.worker_id === w.id).map((a: any) => ({ d: a.day_of_week, n: (a.slots || []).length, has: (a.slots || []).includes(slot) })) }));
      const fresh = slotOk.filter((w: any) => w.last_seen_at && Date.now() - new Date(w.last_seen_at).getTime() < 15 * 60000);
      s.heartbeat_fresh_15m = fresh.map((w: any) => ({ id: w.id, last_seen_at: w.last_seen_at }));
      const notBusy = fresh.filter((w: any) => !w.is_busy && !busyIds.has(w.id));
      s.not_busy = notBusy.map((w: any) => w.id);
      const { data: elig } = await sb.rpc("get_eligible_workers", { p_service: service, p_community: community });
      s.rpc_get_eligible_workers = (elig || []).map((e: any) => ({ id: e.worker_id, name: e.full_name, last_seen_at: e.last_seen_at, is_fresh: e.is_fresh }));
      s.excluded_detail = svc.map((w: any) => ({ id: w.id, name: w.full_name, is_active: w.is_active, is_available: w.is_available, is_busy: w.is_busy, has_active_booking: busyIds.has(w.id), last_seen_at: w.last_seen_at, status: w.status }));
      out.services[service] = s;
      console.log(`[avail-debug] ${service}`, JSON.stringify(s));
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
