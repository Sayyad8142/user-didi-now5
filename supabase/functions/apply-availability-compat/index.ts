/**
 * apply-availability-compat — one-shot admin utility.
 *
 * Probes the EXTERNAL database for a SQL-exec RPC and, when available,
 * applies docs/fix-old-app-availability-compat.sql. Always reports the
 * current shape of get_online_workers_count / check_instant_supply so we can
 * verify what the PUBLISHED app receives.
 */
import { getExternalSupabase } from "../_shared/capacityRules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const community = body.community ?? "prestige-high-fields";
  const sql: string | undefined = body.sql;
  const supabase = getExternalSupabase();
  const report: Record<string, unknown> = {};

  if (sql) {
    const probes = ["exec_sql", "execute_sql", "run_sql", "admin_exec_sql", "sql"];
    const results: Record<string, string> = {};
    for (const fn of probes) {
      for (const argName of ["sql", "query", "p_sql", "statement"]) {
        const { error } = await supabase.rpc(fn, { [argName]: sql });
        results[`${fn}(${argName})`] = error ? error.message : "OK";
        if (!error) {
          report.applied_via = `${fn}(${argName})`;
          break;
        }
      }
      if (report.applied_via) break;
    }
    report.probe_results = results;
  }

  const counts = await supabase.rpc("get_online_workers_count", { p_community: community });
  report.get_online_workers_count = counts.error ? counts.error.message : counts.data;
  const supply = await supabase.rpc("check_instant_supply", { p_community: community });
  report.check_instant_supply = supply.error ? supply.error.message : supply.data;

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
