import { useEffect, useState, useMemo } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { AdminBookingCard } from "@/features/admin/components/AdminBookingCard";
import BookingDrawer from "@/features/admin/BookingDrawer";
import { useBookingsRealtime } from "@/features/admin/useRealtime";
import QuickStats from "@/features/admin/QuickStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Settings, BarChart3, Calendar, MessageSquare } from "lucide-react";
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
      <Route path="/*" element={<div className="min-h-[100svh] max-w-screen-lg mx-auto bg-gradient-to-br from-slate-50 to-blue-50 text-foreground flex flex-col">
          {/* Enhanced modern header */}
          <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/20 safe-top shadow-lg">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xl">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div>
                  <h1 className="font-bold text-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                    Didi Now Admin
                  </h1>
                  <p className="text-sm text-slate-600 font-medium">Administrative Console</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 text-sm font-medium rounded-full border border-green-200 shadow-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  System Online
                </div>
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <div className="w-6 h-6 bg-gradient-to-r from-slate-400 to-slate-600 rounded-full"></div>
                </div>
              </div>
            </div>
          </header>

          {/* Main content with enhanced layout */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Quick Stats - Enhanced */}
            <section className="px-6 py-6">
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="font-bold text-lg text-slate-800">Quick Stats</h2>
                </div>
                <QuickStats />
              </div>
            </section>

            {/* Dashboard content area - Enhanced */}
            <section className="flex-1 overflow-y-auto px-6 pb-24 md:pb-6">
              <div className="max-w-4xl mx-auto">
                <div className="text-center py-16">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <Settings className="h-8 w-8 text-purple-600" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-2xl text-slate-800 mb-3">
                    Welcome to Admin Dashboard
                  </h3>
                  <p className="text-slate-600 mb-8 max-w-md mx-auto leading-relaxed">
                    Manage your platform efficiently with our comprehensive admin tools and real-time insights
                  </p>
                  
                  {/* Action Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                    <div className="group">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/admin/bookings')} 
                        className="w-full h-24 rounded-2xl border-2 border-slate-200 bg-white/50 hover:bg-white hover:border-pink-300 hover:shadow-lg transition-all duration-300 flex flex-col gap-2 group-hover:scale-105"
                      >
                        <Calendar className="h-6 w-6 text-pink-600" />
                        <span className="font-semibold">View Bookings</span>
                      </Button>
                    </div>
                    
                    <div className="group">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/admin/workers')} 
                        className="w-full h-24 rounded-2xl border-2 border-slate-200 bg-white/50 hover:bg-white hover:border-purple-300 hover:shadow-lg transition-all duration-300 flex flex-col gap-2 group-hover:scale-105"
                      >
                        <Settings className="h-6 w-6 text-purple-600" />
                        <span className="font-semibold">Manage Workers</span>
                      </Button>
                    </div>
                    
                    <div className="group">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/admin/chat')} 
                        className="w-full h-24 rounded-2xl border-2 border-slate-200 bg-white/50 hover:bg-white hover:border-blue-300 hover:shadow-lg transition-all duration-300 flex flex-col gap-2 group-hover:scale-105"
                      >
                        <MessageSquare className="h-6 w-6 text-blue-600" />
                        <span className="font-semibold">Messages</span>
                      </Button>
                    </div>
                    
                    <div className="group">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/admin/settings')} 
                        className="w-full h-24 rounded-2xl border-2 border-slate-200 bg-white/50 hover:bg-white hover:border-indigo-300 hover:shadow-lg transition-all duration-300 flex flex-col gap-2 group-hover:scale-105"
                      >
                        <Settings className="h-6 w-6 text-indigo-600" />
                        <span className="font-semibold">Settings</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>

          <AdminBottomNav />
        </div>} />
    </Routes>;
}