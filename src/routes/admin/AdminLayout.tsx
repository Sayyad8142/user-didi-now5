import { useEffect, useState, useMemo } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { AdminBookingCard } from "@/features/admin/components/AdminBookingCard";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import QuickStats from "@/features/admin/QuickStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Settings } from "lucide-react";
import { useNewBookingAlert } from "@/features/admin/useNewBookingAlert";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import { useSLASettings } from "@/features/admin/useSLASettings";
import { useOverdueAlert } from "@/features/admin/useOverdueAlert";
import { useNavigate } from "react-router-dom";
import { Routes, Route } from "react-router-dom";
import AdminCommunities from "./AdminCommunities";
import AdminChat from "./AdminChat";
import AdminUsers from "./AdminUsers";
export default function AdminLayout() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'cancelled' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const {
    enabled: soundOn,
    toggle: toggleSound,
    snooze,
    stopSound,
    play: testSound
  } = useNewBookingAlert();

  // Load SLA settings
  const {
    slaMinutes
  } = useSLASettings();

  // Enable overdue alerts - plays a beep when bookings become overdue
  useOverdueAlert(rows, slaMinutes);

  // initial load with filter
  async function load(statusFilter: 'all' | 'pending' | 'assigned' | 'cancelled' | 'completed' = 'all') {
    let query = supabase.from("bookings").select("*");
    if (statusFilter === 'all') {
      query = query.in("status", ["pending", "assigned"]);
    } else if (statusFilter === 'cancelled') {
      query = query.eq("status", "cancelled");
    } else if (statusFilter === 'completed') {
      query = query.eq("status", "completed");
    } else {
      query = query.eq("status", statusFilter);
    }
    const {
      data
    } = await query.order("created_at", {
      ascending: false
    }).limit(100);
    setRows(data ?? []);
  }
  useEffect(() => {
    load(filterStatus);
  }, [filterStatus]);

  // realtime
  useBookingsRealtime(row => {
    setRows(prev => [row, ...prev]);
  }, row => {
    setRows(prev => prev.map(r => r.id === row.id ? row : r));
  });

  // client-side filtering
  const filteredRows = useMemo(() => {
    let filtered = rows;

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(booking => booking.service_type?.toLowerCase().includes(search) || booking.community?.toLowerCase().includes(search) || booking.flat_no?.toLowerCase().includes(search) || booking.cust_name?.toLowerCase().includes(search) || booking.cust_phone?.toLowerCase().includes(search));
    }
    return filtered;
  }, [rows, searchTerm]);
  const handleFilterChange = (status: 'all' | 'pending' | 'assigned' | 'cancelled' | 'completed') => {
    setFilterStatus(status);
  };
  return <Routes>
      <Route path="/communities" element={<AdminCommunities />} />
      <Route path="/chat" element={<AdminChat />} />
      <Route path="/users" element={<AdminUsers />} />
      <Route path="/*" element={<div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
          {/* Enhanced admin header */}
          <header className="sticky top-0 z-40 bg-gradient-to-r from-pink-50 to-purple-50 backdrop-blur border-b border-pink-100 safe-top shadow-sm">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-xl bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                    Didi Now Admin
                  </h1>
                  <p className="text-xs text-muted-foreground font-medium">Administrative Console</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                  Online
                </div>
              </div>
            </div>
          </header>

          {/* Main content with mobile layout */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Quick Stats - Compact */}
            <section className="px-3 py-3 border-b bg-muted/30">
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="font-semibold text-sm mb-2">Quick Stats</div>
                <QuickStats />
              </div>
            </section>

            {/* Dashboard content area */}
            <section className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-24 md:pb-6">
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground mb-1">
                  Admin Dashboard
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use the navigation below to access different admin functions
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                  <Button variant="outline" onClick={() => navigate('/admin/bookings')} className="rounded-xl h-12">
                    View Bookings
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/admin/workers')} className="rounded-xl h-12">
                    Manage Workers
                  </Button>
                </div>
              </div>
            </section>
          </main>

          <AdminBottomNav />
        </div>} />
    </Routes>;
}