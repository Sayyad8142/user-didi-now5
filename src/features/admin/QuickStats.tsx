import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RotateCw, Calendar, Users } from "lucide-react";

export default function QuickStats(){
  const [stats,setStats] = useState<any>({active:0,pending:0,completed:0,users:0,today:0,workers:0});
  const [isLoading, setIsLoading] = useState(false);
  
  async function load(){
    setIsLoading(true);
    try {
      const todayDate = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
      
      // counts with RLS: admin can read all
      const [{count:pending},{count:assigned},{count:completed},{count:users},{count:todayBookings},{count:workers}] = await Promise.all([
        supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","pending"),
        supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","assigned"),
        supabase.from("bookings").select("*",{count:"exact", head:true}).eq("status","completed"),
        supabase.from("profiles").select("*",{count:"exact", head:true}),
        supabase.from("bookings").select("*",{count:"exact", head:true}).gte("created_at", `${todayDate}T00:00:00`).lt("created_at", `${todayDate}T23:59:59`),
        supabase.from("workers").select("*",{count:"exact", head:true}).eq("is_active", true),
      ]);
      const active = (pending??0) + (assigned??0);
      setStats({active, pending: pending??0, completed: completed??0, users: users??0, today: todayBookings??0, workers: workers??0});
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => {
    load();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(load, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);
  
  const statItems = [
    { label: "Today's Bookings", value: stats.today, linkTo: "/admin/daily-bookings", clickable: true, icon: Calendar },
    { label: "Pending", value: stats.pending, clickable: false },
    { label: "Completed", value: stats.completed, linkTo: "/admin/completed-bookings", clickable: true, icon: Calendar },
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