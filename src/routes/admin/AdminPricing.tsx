import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type MaidTask = "floor_cleaning" | "dish_washing";
const FLATS = ["2BHK","2.5BHK","3BHK","3.5BHK","4BHK"] as const;
const TASKS: MaidTask[] = ["floor_cleaning","dish_washing"];
const TASK_LABEL: Record<MaidTask,string> = {
  floor_cleaning: "Jhaadu & Pocha (Floor Cleaning)",
  dish_washing: "Dish Washing",
};

function Card({title, children}:{title:string; children:React.ReactNode}) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-4 sm:p-5">
      <div className="font-semibold text-lg mb-3 text-foreground">{title}</div>
      {children}
    </div>
  );
}

export default function AdminPricing() {
  const qc = useQueryClient();
  const [community, setCommunity] = useState(""); // '' = Global

  /** Maid prices **/
  const { data: maidRows, isLoading: maidLoading } = useQuery({
    queryKey: ["maid_prices_admin", community],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maid_pricing_tasks")
        .select("flat_size, task, price_inr")
        .eq("community", community)
        .eq("active", true);
      if (error) throw error;
      // Return a map: flat -> task -> price
      const map = new Map<string, Map<MaidTask, number>>();
      for (const f of FLATS) map.set(f, new Map<MaidTask, number>());
      (data ?? []).forEach((r:any) => {
        const inner = map.get(r.flat_size)!;
        inner.set(r.task as MaidTask, r.price_inr);
      });
      return map;
    }
  });

  const [maidForm, setMaidForm] = useState<Record<string, Record<MaidTask, number>>>({});
  useEffect(() => {
    if (!maidRows) return;
    const draft: Record<string, Record<MaidTask, number>> = {};
    for (const f of FLATS) {
      draft[f] = {
        floor_cleaning: maidRows.get(f)?.get("floor_cleaning") ?? 100,
        dish_washing:   maidRows.get(f)?.get("dish_washing")   ?? 100,
      };
    }
    setMaidForm(draft);
  }, [maidRows]);

  const upsertMaid = useMutation({
    mutationFn: async (payload: {flat_size: string; task: MaidTask; price_inr: number}[]) => {
      const rows = payload.map(r => ({ ...r, community, active: true }));
      const { error } = await supabase.from("maid_pricing_tasks").upsert(rows, { onConflict: "flat_size,task,community" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maid_prices_admin", community] })
  });

  function handleMaidSave() {
    const batch: {flat_size:string; task:MaidTask; price_inr:number}[] = [];
    for (const f of FLATS) {
      for (const t of TASKS) {
        batch.push({ flat_size: f, task: t, price_inr: Number(maidForm[f][t]) || 0 });
      }
    }
    upsertMaid.mutate(batch);
  }

  /** Cook settings **/
  const { data: cook, isLoading: cookLoading } = useQuery({
    queryKey: ["cook_settings", community],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cook_pricing_settings")
        .select("*")
        .eq("community", community)
        .maybeSingle();
      if (error) throw error;
      return data ?? { community, base_price_inr: 200, non_veg_extra_inr: 50, per_extra_person_inr: 20 };
    }
  });

  const [cookForm, setCookForm] = useState({ base: 200, nonVeg: 50, perExtra: 20 });
  useEffect(() => {
    if (!cook) return;
    setCookForm({
      base: cook.base_price_inr ?? 200,
      nonVeg: cook.non_veg_extra_inr ?? 50,
      perExtra: cook.per_extra_person_inr ?? 20,
    });
  }, [cook]);

  const upsertCook = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cook_pricing_settings")
        .upsert({
          community,
          base_price_inr: Number(cookForm.base) || 0,
          non_veg_extra_inr: Number(cookForm.nonVeg) || 0,
          per_extra_person_inr: Number(cookForm.perExtra) || 0,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cook_settings", community] })
  });

  return (
    <div className="min-h-dvh bg-background p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <div className="text-2xl font-bold text-primary">Pricing</div>
            <div className="text-xs text-muted-foreground">Edit service prices • Admin only</div>
          </div>
        </div>
      </div>

      {/* Scope (Global or Community) */}
      <Card title="Scope">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-muted-foreground">Community (blank = global)</label>
          <Input
            placeholder="e.g. prestige-high-fields (leave empty for global)"
            value={community}
            onChange={(e)=>setCommunity(e.target.value.trim())}
            className="max-w-md"
          />
        </div>
      </Card>

      {/* Maid prices */}
      <Card title="Maid — Task Prices (per flat size)">
        {maidLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs font-medium text-muted-foreground">
              <div>Flat Size</div>
              <div>{TASK_LABEL.floor_cleaning}</div>
              <div>{TASK_LABEL.dish_washing}</div>
            </div>
            {FLATS.map(f=>(
              <div key={f} className="grid grid-cols-3 gap-3">
                <div className="font-semibold flex items-center">{f}</div>
                <Input
                  type="number"
                  value={maidForm[f]?.floor_cleaning ?? 0}
                  onChange={(e)=>setMaidForm(prev=>({ ...prev, [f]: { ...prev[f], floor_cleaning: Number(e.target.value) } }))}
                />
                <Input
                  type="number"
                  value={maidForm[f]?.dish_washing ?? 0}
                  onChange={(e)=>setMaidForm(prev=>({ ...prev, [f]: { ...prev[f], dish_washing: Number(e.target.value) } }))}
                />
              </div>
            ))}
            <div className="pt-2">
              <Button onClick={handleMaidSave} disabled={upsertMaid.isPending}>
                {upsertMaid.isPending ? "Saving…" : "Save Maid Prices"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Cook settings */}
      <Card title="Cook — Global Settings">
        {cookLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="grid gap-3 max-w-md">
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="text-sm">Base price</div>
              <Input type="number" value={cookForm.base} onChange={(e)=>setCookForm(v=>({...v, base:Number(e.target.value)}))}/>
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="text-sm">Non-veg extra</div>
              <Input type="number" value={cookForm.nonVeg} onChange={(e)=>setCookForm(v=>({...v, nonVeg:Number(e.target.value)}))}/>
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="text-sm">Per extra person</div>
              <Input type="number" value={cookForm.perExtra} onChange={(e)=>setCookForm(v=>({...v, perExtra:Number(e.target.value)}))}/>
            </div>
            <div>
              <Button onClick={()=>upsertCook.mutate()} disabled={upsertCook.isPending}>
                {upsertCook.isPending ? "Saving…" : "Save Cook Settings"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}