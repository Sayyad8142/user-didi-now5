import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import BookingRow from "@/features/admin/BookingRow";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Calendar } from "lucide-react";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import { useSLASettings } from "@/features/admin/useSLASettings";
import { format } from "date-fns";

export default function AdminDailyBookings() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
  });
  const [searchTerm, setSearchTerm] = useState('');
  const { slaMinutes } = useSLASettings();

  // Load bookings for the selected date
  async function loadDailyBookings(date: string) {
    try {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .gte("created_at", `${date}T00:00:00`)
        .lt("created_at", `${date}T23:59:59`)
        .order("created_at", { ascending: false });
      
      setRows(data ?? []);
    } catch (error) {
      console.error('Error loading daily bookings:', error);
    }
  }

  useEffect(() => {
    loadDailyBookings(selectedDate);
  }, [selectedDate]);

  // Realtime updates
  useBookingsRealtime(
    (row) => { 
      // Only add if it matches selected date
      const rowDate = new Date(row.created_at).toISOString().split('T')[0];
      if (rowDate === selectedDate) {
        setRows(prev => [row, ...prev]); 
      }
    },
    (row) => { 
      setRows(prev => prev.map(r => r.id === row.id ? row : r)); 
    }
  );

  // Client-side filtering
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

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) {
      return "Today";
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return "Yesterday";
    } else {
      return format(date, 'MMM dd, yyyy');
    }
  };

  return (
    <div className="min-h-dvh bg-rose-50/40 pb-20">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-pink-50">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="p-2 hover:bg-pink-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-gray-900">Daily Bookings</h1>
              <span className="text-xs text-gray-500">{formatDisplayDate(selectedDate)} • {filteredRows.length} booking(s)</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 pb-24 pt-4 space-y-5">
        {/* Date Selection */}
        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#ff007a]" />
              <span className="font-semibold text-sm">Select Date</span>
            </div>
            
            <div className="flex gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              >
                Today
              </Button>
            </div>
          </div>
        </section>

        {/* Bookings List */}
        <section className="rounded-2xl border border-pink-50 bg-white shadow p-4">
          <div className="font-semibold mb-4">
            Bookings for {formatDisplayDate(selectedDate)}
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
            <div className="text-center py-8 text-gray-500">
              {rows.length === 0 ? (
                <>
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <div className="text-sm">No bookings found for {formatDisplayDate(selectedDate)}</div>
                </>
              ) : (
                <div className="text-sm">No bookings match your search</div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map(b => (
                <BookingRow 
                  key={b.id} 
                  b={b} 
                  onClick={() => { setActive(b); setOpen(true); }} 
                  onInteracted={() => {}}
                  slaMinutes={slaMinutes}
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