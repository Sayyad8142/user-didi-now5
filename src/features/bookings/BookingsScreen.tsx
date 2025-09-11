import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { BookingCard } from './BookingCard';
import { EmptyState } from './EmptyState';
import { useMyBookingsRealtime } from './useMyBookingsRealtime';
import { useBookingStatusToasts } from './useBookingStatusToasts';

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

// Using React Query for caching & SWR; local cache removed

export function BookingsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
// Only enable realtime/toasts after initial load
const [enableRealtime, setEnableRealtime] = useState(false);
const [activeTab, setActiveTab] = useState('upcoming');

// Centralized data fetching with React Query (cached & SWR)
const { data: allBookings = [], isLoading, isFetching, isSuccess, refetch } = useQuery<Booking[]>({
  queryKey: ['bookings', user?.id],
  enabled: !!user,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, service_type, booking_type, scheduled_date, scheduled_time, status, community, flat_no, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return [] as Booking[];
    }
    return (data || []) as Booking[];
  },
  staleTime: 60_000,
  gcTime: 300_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (prev) => prev,
});

  // Memoize filtered bookings to avoid recalculation
  const { upcomingBookings, historyBookings } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    const upcoming = allBookings.filter(booking => {
      if (booking.status === 'completed' || booking.status === 'cancelled') return false;
      if (booking.booking_type === 'instant') return true;
      if (booking.booking_type === 'scheduled' && booking.scheduled_date) {
        return booking.scheduled_date >= today;
      }
      return true;
    });

    const history = allBookings.filter(booking => {
      if (booking.status === 'completed' || booking.status === 'cancelled') return true;
      if (booking.booking_type === 'scheduled' && booking.scheduled_date) {
        return booking.scheduled_date < today;
      }
      return false;
    });

    return { upcomingBookings: upcoming, historyBookings: history };
  }, [allBookings]);

// Data fetching handled by React Query above

useEffect(() => {
  if (isSuccess) setEnableRealtime(true);
}, [isSuccess]);

const handleRefresh = () => {
  refetch();
};

  // Always call hooks but conditionally enable them
  useMyBookingsRealtime(enableRealtime);
  useBookingStatusToasts(enableRealtime);

  // Show loading skeleton on initial load
  if (isLoading) {
    return (
      <div className="min-h-screen pb-24 bg-slate-50">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary">Bookings</h1>
            <div className="flex justify-center mt-8">
              <CleaningLoader size="lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <h1 className="text-2xl font-bold text-primary">Bookings</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="text-muted-foreground"
            >
              <RefreshCcw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="upcoming" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none pb-2 font-medium"
              >
                Upcoming ({upcomingBookings.length})
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none pb-2 font-medium"
              >
                History ({historyBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4 mt-6">
              {upcomingBookings.length === 0 ? (
                <EmptyState type="upcoming" />
              ) : (
                upcomingBookings.map(booking => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              {historyBookings.length === 0 ? (
                <EmptyState type="history" />
              ) : (
                historyBookings.map(booking => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}