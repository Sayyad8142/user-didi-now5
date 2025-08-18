import { useEffect, useState, useMemo } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import BookingRow from "@/features/admin/BookingRow";
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { enabled: soundOn, toggle: toggleSound, snooze, stopSound, play: testSound } = useNewBookingAlert();
  
  // Load SLA settings
  const { slaMinutes } = useSLASettings();
  
  // Enable overdue alerts - plays a beep when bookings become overdue
  useOverdueAlert(rows, slaMinutes);

  // initial load with filter
  async function load(statusFilter: 'all' | 'pending' | 'assigned' = 'all') {
    let query = supabase
      .from("bookings")
      .select("*");
    
    if (statusFilter === 'all') {
      query = query.in("status", ["pending","assigned"]);
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

  const handleFilterChange = (status: 'all' | 'pending' | 'assigned') => {
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
        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-4">Live Queue</div>
          
          {/* Filter Chips */}
          <div className="flex gap-2 mb-4">
            {(['all', 'pending', 'assigned'] as const).map((status) => (
              <Button
                key={status}
                variant={filterStatus === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange(status)}
                className="capitalize"
              >
                {status === 'all' ? 'All' : status}
              </Button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by service, community, flat, name, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredRows.length === 0 ? (
            <div className="text-sm text-gray-600">
              {rows.length === 0 ? 'No active bookings yet' : 'No bookings match your search'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map(b => (
                <BookingRow 
                  key={b.id} 
                  b={b} 
                  onClick={() => { setActive(b); setOpen(true); }} 
                  onInteracted={() => { snooze(4000); stopSound(); }}
                  slaMinutes={slaMinutes}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-3">Quick Stats</div>
          <QuickStats/>
        </section>
      </main>

      <AdminBottomNav />
      <BookingDrawer open={open} onOpenChange={setOpen} booking={active}/>
    </div>
  );
}