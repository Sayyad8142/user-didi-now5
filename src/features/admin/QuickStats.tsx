import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RotateCw, Calendar, Users } from "lucide-react";

export default function QuickStats(){
  const [stats,setStats] = useState<any>({pending:0,completed:0,users:0,today:0,workers:0,revenue:0});
  const [isLoading, setIsLoading] = useState(false);
  
  async function load(){
    setIsLoading(true);
    try {
      const [rpcResult, usersResult, workersResult] = await Promise.all([
        supabase.rpc('admin_quick_stats'),
        supabase.from("profiles").select("*",{count:"exact", head:true}),
        supabase.from("workers").select("*",{count:"exact", head:true}).eq("is_active", true),
      ]);
      
      const s = rpcResult.data as any ?? {};
      setStats({
        today: s.today ?? 0,
        pending: s.pending ?? 0,
        completed: s.completed ?? 0,
        revenue: s.revenue ?? 0,
        users: usersResult.count ?? 0, 
        workers: workersResult.count ?? 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => {
    load();
    
    // Reduced frequency: Auto-refresh every 2 minutes instead of 30 seconds
    const interval = setInterval(load, 120000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);
  
  const statItems = [
    { label: "Today's Bookings", value: stats.today, linkTo: "/admin/daily-bookings", clickable: true, icon: Calendar },
    { label: "Pending", value: stats.pending, clickable: false },
    { label: "Completed", value: stats.completed, linkTo: "/admin/completed-bookings", clickable: true, icon: Calendar },
    { label: "Revenue ₹", value: stats.revenue, clickable: false },
    { label: "Total Users", value: stats.users, linkTo: "/admin/users", clickable: true, icon: Calendar },
    { label: "Total Workers", value: stats.workers, linkTo: "/admin/workers", clickable: true, icon: Users },
  ];
  
  return (
    <div className="relative">
      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute top-0 right-0 z-10">
          <RotateCw className="h-4 w-4 text-gray-400 animate-spin" />
        </div>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {statItems.map(({label, value, linkTo, clickable, icon: Icon}) => {
          const isPending = label === "Pending" && value > 0;
          
          const content = (
            <div className={`rounded-2xl border shadow p-4 ${
              isPending 
                ? 'border-red-200 bg-red-50' 
                : 'border-pink-50 bg-white'
            }`}>
              <div className={`text-2xl font-bold ${
                isPending ? 'text-red-600' : 'text-[#ff007a]'
              }`}>{value}</div>
              <div className={`text-sm flex items-center gap-1 ${
                isPending ? 'text-red-700' : 'text-gray-700'
              }`}>
                {clickable && Icon && <Icon className="h-3 w-3" />}
                {!clickable && <Calendar className="h-3 w-3" />}
                {label}
              </div>
            </div>
          );
          
          if (clickable && linkTo) {
            return (
              <Link 
                key={label} 
                to={linkTo}
                className="block hover:scale-105 transition-transform duration-200"
              >
                {content}
              </Link>
            );
          }
          
          return <div key={label}>{content}</div>;
        })}
      </div>
    </div>
  );
}