import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminBookingCard } from "@/features/admin/components/AdminBookingCard";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowLeft } from "lucide-react";
import { useNewBookingAlert } from "@/features/admin/useNewBookingAlert";
import { useSLASettings } from "@/features/admin/useSLASettings";
import { useOverdueAlert } from "@/features/admin/useOverdueAlert";
import { useNavigate } from "react-router-dom";
import { AdminBottomNav } from "@/components/AdminBottomNav";

export default function AdminBookings() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
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
    <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8 rounded-xl"
            onClick={() => navigate('/admin')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg">
              <span className="text-[#ff007a]">All Bookings</span>
            </h1>
          </div>
        </div>
      </header>

      {/* Main content with mobile layout */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tab filters - Mobile scroll */}
        <div className="px-3 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'pending', 'assigned', 'completed', 'cancelled'] as const).map((status) => {
            const isActive = filterStatus === status;
            const count = status === 'all' 
              ? rows.filter(r => ['pending', 'assigned'].includes(r.status)).length
              : rows.filter(r => r.status === status).length;
            
            return (
              <Button
                key={status}
                variant={isActive ? "default" : "secondary"}
                size="sm"
                onClick={() => handleFilterChange(status)}
                className="rounded-full px-4 flex-shrink-0 h-9"
              >
                <span className="capitalize">
                  {status === 'all' ? 'All Active' : status}
                </span>
                {count > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-background/80 text-foreground">
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        {/* Search bar - Mobile friendly */}
        <div className="px-3 pt-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by service, community, flat, phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 h-11 rounded-xl bg-muted/50 border-muted focus:bg-background transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Booking cards - Mobile optimized grid */}
        <section className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-32 md:pb-6">
          {filteredRows.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">
                {rows.length === 0 ? 'No Active Bookings' : 'No Results Found'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 
                  ? 'New bookings will appear here automatically' 
                  : 'Try adjusting your search or filter'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map(booking => (
                <AdminBookingCard 
                  key={booking.id} 
                  booking={booking}
                  slaMinutes={slaMinutes}
                  onCancel={() => {
                    setRows(prev => prev.filter(row => row.id !== booking.id));
                  }}
                  onUpdate={(updatedBooking) => {
                    setRows(prev => prev.map(row => 
                      row.id === updatedBooking.id ? updatedBooking : row
                    ));
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <AdminBottomNav />
      <BookingDrawer open={open} onOpenChange={setOpen} booking={active}/>
    </div>
  );
}