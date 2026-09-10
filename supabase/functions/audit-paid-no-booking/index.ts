/** TEMPORARY read-only production probe for the paid-without-booking audit. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const RZP_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RZP_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
  const out: Record<string, unknown> = {};
  const phones = ["+919580652791", "919580652791", "9580652791", "+91 95806 52791"];

  const { data: profiles, error: pErr } = await db
    .from("profiles").select("*").or(phones.map((p) => `phone.eq.${p}`).join(","));
  out.profiles = pErr ? pErr.message : profiles;
  out.profiles_like = (await db.from("profiles").select("id,phone,full_name,flat_no,community,firebase_uid,created_at").ilike("phone", "%9580652791%")).data;

  const ids = (profiles ?? []).map((p: any) => p.id);
  if (ids.length) {
    out.bookings_for_user = (await db.from("bookings").select("*").in("user_id", ids)).data;
    out.pending_for_user = (await db.from("pending_bookings").select("*").in("user_id", ids)).data;
    out.wallet_txns = (await db.from("wallet_transactions").select("*").in("user_id", ids).order("created_at",{ascending:false}).limit(20)).data;
  }
  out.bookings_flat_2277 = (await db.from("bookings").select("id,user_id,created_at,status,payment_status,booking_type,scheduled_date,scheduled_time,flat_no,community,price_inr,razorpay_order_id,razorpay_payment_id").eq("flat_no","2277").order("created_at",{ascending:false}).limit(20)).data;

  // all pending_bookings not consumed
  const pend = await db.from("pending_bookings").select("razorpay_order_id,user_id,request_id,status,amount_inr,payment_type,booking_id,created_at,last_error,booking_data").neq("status","consumed").order("created_at",{ascending:false}).limit(100);
  out.pending_unconsumed = pend.error ? pend.error.message : pend.data;
  out.pending_status_counts = (pend.data ?? []).reduce((a: any, r: any) => { a[r.status] = (a[r.status]||0)+1; return a; }, {});
  out.orphan_payments = (await db.from("orphan_payments").select("*").order("created_at",{ascending:false}).limit(50)).data;

  // Razorpay: recent payments (last 3 days)
  try {
    const from = Math.floor(Date.now()/1000) - 3*86400;
    const r = await fetch(`https://api.razorpay.com/v1/payments?count=100&from=${from}`, {
      headers: { Authorization: "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`) },
    });
    const j = await r.json();
    out.razorpay_recent = (j.items ?? []).map((p: any) => ({
      id: p.id, order_id: p.order_id, status: p.status, amount: p.amount,
      contact: p.contact, created_at: new Date(p.created_at*1000).toISOString(), method: p.method,
      notes: p.notes,
    }));
  } catch (e: any) { out.razorpay_recent = e.message; }

  return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
