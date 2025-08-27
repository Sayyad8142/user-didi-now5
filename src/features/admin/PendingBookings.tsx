import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminBookingCard } from "./components/AdminBookingCard";
import { Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PendingBookings() {
  const navigate = useNavigate();
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPendingBookings = async () => {
    try {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      
      setPendingBookings(data ?? []);
    } catch (error) {
      console.error("Error loading pending bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingBookings();

    // Listen for real-time updates
    const channel = supabase
      .channel("pending-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => loadPendingBookings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/30">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-slate-200 rounded"></div>
            <div className="h-16 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold text-lg text-slate-800">Pending Bookings</h2>
          {pendingBookings.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
              <AlertCircle className="w-3 h-3" />
              {pendingBookings.length}
            </div>
          )}
        </div>
        {pendingBookings.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/admin/bookings')}
            className="text-xs"
          >
            View All
          </Button>
        )}
      </div>

      {pendingBookings.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Clock className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-slate-600 font-medium">No pending bookings</p>
          <p className="text-slate-500 text-sm">All caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingBookings.map((booking) => (
            <div
              key={booking.id}
              className="cursor-pointer"
              onClick={() => navigate(`/admin/bookings?b=${booking.id}`)}
            >
              <AdminBookingCard
                booking={booking}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}