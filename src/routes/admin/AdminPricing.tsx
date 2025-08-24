import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import { ArrowLeft, DollarSign, Save } from "lucide-react";

type MaidTask = "floor_cleaning" | "dish_washing";
const FLATS = ["2BHK","2.5BHK","3BHK","3.5BHK","4BHK"] as const;
const TASKS: MaidTask[] = ["floor_cleaning","dish_washing"];
const TASK_LABEL: Record<MaidTask,string> = {
  floor_cleaning: "Floor Cleaning",
  dish_washing: "Dish Washing",
};

function BathroomSettings({ community }: { community: string }) {
  const qc = useQueryClient();

  const { data: bathroom, isLoading: bathroomLoading } = useQuery({
    queryKey: ["bathroom_settings", community],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bathroom_pricing_settings")
        .select("*")
        .eq("community", community)
        .maybeSingle();
      if (error) throw error;
      return data ?? { community, unit_price_inr: 250 };
    }
  });

  const [bathroomForm, setBathroomForm] = useState({ unitPrice: 250 });
  useEffect(() => {
    if (!bathroom) return;
    setBathroomForm({
      unitPrice: bathroom.unit_price_inr ?? 250,
    });
  }, [bathroom]);

  const upsertBathroom = useMutation({
    mutationFn: async () => {
      console.log('🔧 Attempting to save bathroom pricing:', bathroomForm);
      const { error } = await supabase
        .from("bathroom_pricing_settings")
        .upsert({
          community,
          unit_price_inr: Number(bathroomForm.unitPrice) || 0,
          updated_at: new Date().toISOString()
        });
      if (error) {
        console.error('❌ Bathroom pricing save error:', error);
        throw error;
      }
      console.log('✅ Bathroom pricing saved successfully');
    },
    onSuccess: () => {
      console.log('🔄 Invalidating bathroom settings query');
      qc.invalidateQueries({ queryKey: ["bathroom_settings", community] });
    },
    onError: (error) => {
      console.error('💥 Bathroom mutation error:', error);
    }
  });

  return (
    <CardContent className="pt-6">
      {bathroomLoading ? (
        <div className="text-sm text-muted-foreground">Loading bathroom settings...</div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bathroom-price">Price per bathroom (₹)</Label>
            <Input 
              id="bathroom-price"
              type="number" 
              value={bathroomForm.unitPrice} 
              onChange={(e) => setBathroomForm(v => ({ ...v, unitPrice: Number(e.target.value) }))}
              className="text-lg h-12"
              placeholder="250"
            />
            <p className="text-xs text-muted-foreground">
              Price charged per bathroom for cleaning service
            </p>
          </div>
          <Button 
            onClick={() => upsertBathroom.mutate()} 
            disabled={upsertBathroom.isPending}
            className="w-full h-12"
          >
            <Save className="w-4 h-4 mr-2" />
            {upsertBathroom.isPending ? "Saving..." : "Save Bathroom Pricing"}
          </Button>
        </div>
      )}
    </CardContent>
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
      console.log('🔧 Attempting to save maid pricing:', payload);
      const rows = payload.map(r => ({ ...r, community, active: true }));
      const { error } = await supabase.from("maid_pricing_tasks").upsert(rows, { onConflict: "flat_size,task,community" });
      if (error) {
        console.error('❌ Maid pricing save error:', error);
        throw error;
      }
      console.log('✅ Maid pricing saved successfully');
    },
    onSuccess: () => {
      console.log('🔄 Invalidating maid prices query');
      qc.invalidateQueries({ queryKey: ["maid_prices_admin", community] });
    },
    onError: (error) => {
      console.error('💥 Maid mutation error:', error);
    }
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
      console.log('🔧 Attempting to save cook pricing:', cookForm);
      const { error } = await supabase
        .from("cook_pricing_settings")
        .upsert({
          community,
          base_price_inr: Number(cookForm.base) || 0,
          non_veg_extra_inr: Number(cookForm.nonVeg) || 0,
          per_extra_person_inr: Number(cookForm.perExtra) || 0,
          updated_at: new Date().toISOString()
        });
      if (error) {
        console.error('❌ Cook pricing save error:', error);
        throw error;
      }
      console.log('✅ Cook pricing saved successfully');
    },
    onSuccess: () => {
      console.log('🔄 Invalidating cook settings query');
      qc.invalidateQueries({ queryKey: ["cook_settings", community] });
    },
    onError: (error) => {
      console.error('💥 Cook mutation error:', error);
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-4">
            <Link 
              to="/admin" 
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Service Pricing</h1>
              <p className="text-sm text-gray-500">Configure rates for all services</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
        {/* Community Scope */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#ff007a]" />
              Pricing Scope
            </CardTitle>
            <CardDescription>
              Set prices globally or for specific communities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="community">Community Name</Label>
              <Input
                id="community"
                placeholder="Leave blank for global pricing (e.g., prestige-high-fields)"
                value={community}
                onChange={(e) => setCommunity(e.target.value.trim())}
                className="h-12"
              />
              <p className="text-xs text-muted-foreground">
                {community.trim() ? `Setting prices for ${community}` : "Setting global prices (applies to all communities)"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Maid Service Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Maid Service Pricing</CardTitle>
            <CardDescription>
              Set prices for cleaning tasks by apartment size
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maidLoading ? (
              <div className="text-center py-8">
                <div className="text-sm text-muted-foreground">Loading maid pricing...</div>
              </div>
            ) : (
              <div className="space-y-6">
                {FLATS.map((flat, index) => (
                  <div key={flat}>
                    {index > 0 && <Separator className="my-4" />}
                    <div className="space-y-4">
                      <h4 className="font-medium text-lg text-gray-900">{flat}</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        {TASKS.map(task => (
                          <div key={task} className="space-y-2">
                            <Label>{TASK_LABEL[task]}</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                              <Input
                                type="number"
                                value={maidForm[flat]?.[task] ?? 0}
                                onChange={(e) => setMaidForm(prev => ({
                                  ...prev, 
                                  [flat]: { 
                                    ...prev[flat], 
                                    [task]: Number(e.target.value) 
                                  }
                                }))}
                                className="pl-8 text-lg h-12"
                                placeholder="100"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <Button 
                    onClick={handleMaidSave} 
                    disabled={upsertMaid.isPending}
                    className="w-full h-12"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {upsertMaid.isPending ? "Saving..." : "Save Maid Pricing"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cook Service Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Cook Service Pricing</CardTitle>
            <CardDescription>
              Base rates and additional charges for cooking service
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cookLoading ? (
              <div className="text-center py-4">
                <div className="text-sm text-muted-foreground">Loading cook settings...</div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="base-price">Base Price (₹)</Label>
                    <Input 
                      id="base-price"
                      type="number" 
                      value={cookForm.base} 
                      onChange={(e) => setCookForm(v => ({ ...v, base: Number(e.target.value) }))}
                      className="text-lg h-12"
                      placeholder="200"
                    />
                    <p className="text-xs text-muted-foreground">Basic cooking service charge</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="nonveg-extra">Non-Veg Extra (₹)</Label>
                    <Input 
                      id="nonveg-extra"
                      type="number" 
                      value={cookForm.nonVeg} 
                      onChange={(e) => setCookForm(v => ({ ...v, nonVeg: Number(e.target.value) }))}
                      className="text-lg h-12"
                      placeholder="50"
                    />
                    <p className="text-xs text-muted-foreground">Additional charge for non-veg meals</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="extra-person">Per Extra Person (₹)</Label>
                    <Input 
                      id="extra-person"
                      type="number" 
                      value={cookForm.perExtra} 
                      onChange={(e) => setCookForm(v => ({ ...v, perExtra: Number(e.target.value) }))}
                      className="text-lg h-12"
                      placeholder="20"
                    />
                    <p className="text-xs text-muted-foreground">Charge per additional family member</p>
                  </div>
                </div>
                
                <Button 
                  onClick={() => upsertCook.mutate()} 
                  disabled={upsertCook.isPending}
                  className="w-full h-12"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {upsertCook.isPending ? "Saving..." : "Save Cook Pricing"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bathroom Cleaning Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Bathroom Cleaning Pricing</CardTitle>
            <CardDescription>
              Set the rate per bathroom for cleaning service
            </CardDescription>
          </CardHeader>
          <BathroomSettings community={community} />
        </Card>
      </div>
    </div>
  );
}