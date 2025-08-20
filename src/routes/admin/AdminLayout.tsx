import { useEffect, useState, useMemo } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { AdminBookingCard } from "@/features/admin/components/AdminBookingCard";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import QuickStats from "@/features/admin/QuickStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Bell, BellOff, Settings } from "lucide-react";
import { useNewBookingAlert } from "@/features/admin/useNewBookingAlert";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import { useSLASettings } from "@/features/admin/useSLASettings";
import { useOverdueAlert } from "@/features/admin/useOverdueAlert";
import { Link } from "react-router-dom";

export default function AdminLayout() {
  const [rows,setRows] = useState<any[]>([]);
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'cancelled' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { enabled: soundOn, toggle: toggleSound, snooze, stopSound, play: testSound } = useNewBookingAlert();
  
  // Load SLA settings
  const { slaMinutes } = useSLASettings();
  
  // Enable overdue alerts - plays a beep when bookings become overdue
  useOverdueAlert(rows, slaMinutes);

  // initial load with filter
  async function load(statusFilter: 'all' | 'pending' | 'assigned' | 'cancelled' | 'completed' = 'all') {
    let query = supabase
      .from("bookings")
      .select("*");
    
    if (statusFilter === 'all') {
      query = query.in("status", ["pending","assigned"]);
    } else if (statusFilter === 'cancelled') {
      query = query.eq("status", "cancelled");
    } else if (statusFilter === 'completed') {
      query = query.eq("status", "completed");
    } else {
      query = query.eq("status", statusFilter);
    }
    
    const { data } = await query
      .order("created_at", { ascending:false })
      .limit(100);
    setRows(data ?? []);
  }
  
  useEffect(()=>{ load(filterStatus); },[filterStatus]);

  // realtime
  useBookingsRealtime(
    (row)=>{ 
      setRows(prev => [row, ...prev]); 
    },
    (row)=>{ setRows(prev => prev.map(r => r.id===row.id ? row : r)); }
  );

  // client-side filtering
  const filteredRows = useMemo(() => {
    let filtered = rows;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(booking => 
        booking.service_type?.toLowerCase().includes(search) ||
        booking.community?.toLowerCase().includes(search) ||
        booking.flat_no?.toLowerCase().includes(search) ||
        booking.cust_name?.toLowerCase().includes(search) ||
        booking.cust_phone?.toLowerCase().includes(search)
      );
    }
    
    return filtered;
  }, [rows, searchTerm]);

  const handleFilterChange = (status: 'all' | 'pending' | 'assigned' | 'cancelled' | 'completed') => {
    setFilterStatus(status);
  };

  return (
    <div className="min-h-dvh bg-rose-50/40 pb-20">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-pink-50">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-2xl font-bold">
              <span className="text-[#ff007a]">Didi Now</span> — <span className="text-[#ff007a]">Admin</span>
            </h1>
            <span className="text-xs text-gray-500 hidden sm:block">Administrative Console</span>
          </div>

          <div className="flex gap-2">
            <Link
              to="/admin/settings"
              className="h-9 px-3 rounded-full border border-gray-300 text-gray-700 hover:border-pink-300 hover:text-[#ff007a] hover:bg-pink-50 text-sm inline-flex items-center gap-2 transition-colors"
              title="Admin Settings"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full px-4 pb-24 pt-4 space-y-5">
        {/* Quick Stats - Moved to top */}
        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-3">Quick Stats</div>
          <QuickStats/>
        </section>

        <section className="space-y-6">
          {/* Live Queue Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Live Queue</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              Real-time updates
            </div>
          </div>
          
          {/* Modern Filter Tabs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex bg-gray-50/50">
              {(['all', 'pending', 'assigned', 'completed', 'cancelled'] as const).map((status, index) => {
                const isActive = filterStatus === status;
                const count = status === 'all' 
                  ? rows.filter(r => ['pending', 'assigned'].includes(r.status)).length
                  : rows.filter(r => r.status === status).length;
                
                return (
                  <button
                    key={status}
                    onClick={() => handleFilterChange(status)}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-all relative ${
                      isActive 
                        ? 'text-[#ff007a] bg-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="capitalize">
                        {status === 'all' ? 'All Active' : status}
                      </span>
                      {count > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isActive 
                            ? 'bg-[#ff007a] text-white' 
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {count}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ff007a]"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Enhanced Search Bar */}
            <div className="p-4 border-t border-gray-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  placeholder="Search by service, community, flat number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-12 pr-4 py-3 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white transition-colors"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Results Section */}
            <div className="p-4 pt-0">
              {filteredRows.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">
                    {rows.length === 0 ? 'No Active Bookings' : 'No Results Found'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {rows.length === 0 
                      ? 'New bookings will appear here automatically' 
                      : 'Try adjusting your search or filter'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRows.map(b => (
                    <AdminBookingCard 
                      key={b.id} 
                      booking={b}
                      slaMinutes={slaMinutes}
                      onCancel={() => {
                        // Remove from local state immediately
                        setRows(prev => prev.filter(row => row.id !== b.id));
                      }}
                      onUpdate={(updatedBooking) => {
                        // Update local state immediately for optimistic UI
                        setRows(prev => prev.map(row => 
                          row.id === updatedBooking.id ? updatedBooking : row
                        ));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <AdminBottomNav />
      <BookingDrawer open={open} onOpenChange={setOpen} booking={active}/>
    </div>
  );
}