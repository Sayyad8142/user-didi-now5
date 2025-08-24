import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BookingRow from "@/features/admin/BookingRow";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, CheckCircle2, Calendar } from "lucide-react";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import { useSLASettings } from "@/features/admin/useSLASettings";
import { format } from "date-fns";

export default function AdminCompletedBookings() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month'
  const { slaMinutes } = useSLASettings();

  // Load completed bookings
  async function loadCompletedBookings() {
    try {
      let query = supabase
        .from("bookings")
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      // Apply date filters
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (dateFilter === 'today') {
        query = query.gte("completed_at", today.toISOString());
      } else if (dateFilter === 'week') {
        query = query.gte("completed_at", weekAgo.toISOString());
      } else if (dateFilter === 'month') {
        query = query.gte("completed_at", monthAgo.toISOString());
      }

      const { data } = await query.limit(100);
      setRows(data ?? []);
    } catch (error) {
      console.error('Error loading completed bookings:', error);
    }
  }

  useEffect(() => {
    loadCompletedBookings();
  }, [dateFilter]);

  // Realtime updates
  useBookingsRealtime(
    (row) => { 
      // Add new completed bookings
      if (row.status === 'completed') {
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
        booking.cust_phone?.toLowerCase().includes(search) ||
        booking.worker_name?.toLowerCase().includes(search)
      );
    }
    
    return filtered;
  }, [rows, searchTerm]);

  const getDateFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Today';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      default: return 'All Time';
    }
  };

  return (
    <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link to="/admin" className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg">Completed Bookings</h1>
            <p className="text-xs text-muted-foreground">
              {getDateFilterLabel()} • {filteredRows.length} completed
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-6">
        {/* Filters */}
        <div className="p-3 space-y-3">
          {/* Date Filter */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'Last 7 Days' },
              { key: 'month', label: 'Last 30 Days' }
            ].map(filter => (
              <Button
                key={filter.key}
                variant={dateFilter === filter.key ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilter(filter.key)}
                className="rounded-full px-4 flex-shrink-0 h-9"
              >
                <Calendar className="h-3 w-3 mr-1" />
                {filter.label}
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search completed bookings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 h-11 rounded-xl bg-muted/50 border-muted focus:bg-background transition-colors"
            />
          </div>
        </div>

        {/* Bookings List */}
        <div className="flex-1 overflow-y-auto px-3">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-foreground mb-1">
                {rows.length === 0 ? 'No Completed Bookings' : 'No Results Found'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 
                  ? `No completed bookings found for ${getDateFilterLabel().toLowerCase()}` 
                  : 'Try adjusting your search or filter'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredRows.map(booking => (
                <div key={booking.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">
                          {booking.service_type?.charAt(0).toUpperCase() + booking.service_type?.slice(1)}
                        </span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Completed
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-2">
                          <span>Customer: {booking.cust_name}</span>
                          <span>•</span>
                          <span>{booking.cust_phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{booking.community} - {booking.flat_no}</span>
                        </div>
                        {booking.worker_name && (
                          <div className="flex items-center gap-2">
                            <span>Worker: {booking.worker_name}</span>
                            {booking.worker_phone && (
                              <>
                                <span>•</span>
                                <span>{booking.worker_phone}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-semibold text-sm text-green-600">
                        ₹{booking.price_inr}
                      </div>
                      <div className="text-xs text-gray-500">
                        {booking.completed_at && format(new Date(booking.completed_at), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span>
                      Booked: {format(new Date(booking.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setActive(booking); setOpen(true); }}
                      className="h-6 px-2 text-xs"
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AdminBottomNav />
      <BookingDrawer open={open} onOpenChange={setOpen} booking={active}/>
    </div>
  );
}