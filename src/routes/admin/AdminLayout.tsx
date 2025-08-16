import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import BookingRow from "@/features/admin/BookingRow";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import QuickStats from "@/features/admin/QuickStats";

export default function AdminLayout() {
  const [rows,setRows] = useState<any[]>([]);
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState<any>(null);

  // initial load
  async function load() {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .in("status", ["pending","assigned"])
      .order("created_at", { ascending:false })
      .limit(100);
    setRows(data ?? []);
  }
  useEffect(()=>{ load(); },[]);

  // realtime
  useBookingsRealtime(
    (row)=>{ setRows(prev => [row, ...prev]); },
    (row)=>{ setRows(prev => prev.map(r => r.id===row.id ? row : r)); }
  );

  return (
    <div className="min-h-dvh bg-rose-50/40">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-pink-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <span className="text-[#ff007a]">Didi Now</span> — <span className="text-[#ff007a]">Admin</span>
          </h1>
          <div className="text-xs text-gray-500">Administrative Console</div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-24 pt-4 space-y-5">
        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-2">Live Queue</div>
          {rows.length === 0 ? (
            <div className="text-sm text-gray-600">No active bookings yet</div>
          ) : (
            <div className="space-y-3">
              {rows.map(b => (
                <BookingRow key={b.id} b={b} onClick={()=>{ setActive(b); setOpen(true); }} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-3">Quick Stats</div>
          <QuickStats/>
        </section>
      </main>

      <BookingDrawer open={open} onOpenChange={setOpen} booking={active}/>
    </div>
  );
}