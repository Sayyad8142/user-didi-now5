import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function QuickStats(){
  const [stats,setStats] = useState<any>({active:0,pending:0,completed:0,users:0});
  
  async function load(){
    // counts with RLS: admin can read all
    const [{count:pending},{count:assigned},{count:completed},{count:users}] = await Promise.all([
      supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","pending"),
      supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","assigned"),
      supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","completed"),
      supabase.from("profiles").select("*",{count:"exact", head:true}),
    ]);
    const active = (pending??0) + (assigned??0);
    setStats({active, pending: pending??0, completed: completed??0, users: users??0});
  }
  
  useEffect(()=>{ load(); },[]);
  
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        ["Active Bookings", stats.active],
        ["Pending", stats.pending],
        ["Completed", stats.completed],
        ["Total Users", stats.users],
      ].map(([label,val])=>(
        <div key={label as string} className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="text-2xl font-bold text-[#ff007a]">{val as number}</div>
          <div className="text-sm text-gray-700">{label as string}</div>
        </div>
      ))}
    </div>
  );
}