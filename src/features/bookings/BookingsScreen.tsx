import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { BookingCard } from './BookingCard';
import { EmptyState } from './EmptyState';
interface Booking {
  id: string;
  service_type: string;
  booking_type: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  status: string;
  community: string;
  flat_no: string;
  created_at: string;
}
export function BookingsScreen() {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchBookings = async (showRefreshLoader = false) => {
    if (!user) {
      navigate('/auth');
      return;
    }
    try {
      if (showRefreshLoader) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const today = new Date().toISOString().split('T')[0];

      // Fetch upcoming bookings
      const {
        data: upcoming,
        error: upcomingError
      } = await supabase.from('bookings').select('*').eq('user_id', user.id).or(`and(status.in.(pending,assigned),booking_type.eq.instant),and(status.in.(pending,assigned),booking_type.eq.scheduled,scheduled_date.gte.${today})`).order('created_at', {
        ascending: false
      });
      if (upcomingError) {
        console.error('Error fetching upcoming bookings:', upcomingError);
      } else {
        setUpcomingBookings(upcoming || []);
      }

      // Fetch history bookings
      const {
        data: history,
        error: historyError
      } = await supabase.from('bookings').select('*').eq('user_id', user.id).or(`status.in.(completed,cancelled),and(booking_type.eq.scheduled,scheduled_date.lt.${today})`).order('created_at', {
        ascending: false
      });
      if (historyError) {
        console.error('Error fetching history bookings:', historyError);
      } else {
        setHistoryBookings(history || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    fetchBookings();
  }, [user]);
  const handleRefresh = () => {
    fetchBookings(true);
  };
  if (loading) {
    return <div className="min-h-screen bg-[#FFF6F2] pb-24">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <Skeleton className="h-8 w-32 mx-auto mb-2" />
            <Skeleton className="h-10 w-48 mx-auto" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen pb-24 bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="text-muted-foreground">
              <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-transparent p-0 h-auto">
              <TabsTrigger value="upcoming" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none pb-2 font-medium">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none pb-2 font-medium">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4 mt-6">
              {upcomingBookings.length === 0 ? <EmptyState type="upcoming" /> : upcomingBookings.map(booking => <BookingCard key={booking.id} booking={booking} />)}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              {historyBookings.length === 0 ? <EmptyState type="history" /> : historyBookings.map(booking => <BookingCard key={booking.id} booking={booking} />)}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>;
}