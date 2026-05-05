import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useQuery } from '@tanstack/react-query';
import { BookingCard } from './BookingCard';
import { EmptyState } from './EmptyState';
import { useMyBookingsRealtime } from './useMyBookingsRealtime';
import { useBookingStatusToasts } from './useBookingStatusToasts';
import { getFirebaseIdToken } from '@/lib/firebase';

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
  price_inr?: number | null;
  discount_inr?: number | null;
  discount_reason?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
  worker_phone?: string | null;
  worker_upi?: string | null;
  worker_photo_url?: string | null;
  auto_complete_at?: string | null;
  assigned_at?: string | null;
  pay_enabled_at?: string | null;
  cancel_source?: string | null;
  cancel_reason?: string | null;
  completion_otp?: string | null;
  otp_verified_at?: string | null;
  payment_status?: string | null;
  wallet_refund_status?: string | null;
  wallet_refund_amount?: number | null;
  wallet_refund_reason?: string | null;
}

// Using React Query for caching & SWR; local cache removed

export function BookingsScreen() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  
// Only enable realtime/toasts after initial load
const [enableRealtime, setEnableRealtime] = useState(false);
const [activeTab, setActiveTab] = useState('upcoming');

// Optimized data fetching with pagination and minimal fields
const { data: allBookings = [], isLoading, isFetching, isSuccess, refetch } = useQuery<Booking[]>({
  queryKey: ['bookings', profile?.id],
  enabled: !!profile?.id,
  queryFn: async () => {
    // Bookings RLS blocks anon reads. Proxy via the bookings-read edge function
    // (service role) which verifies Firebase identity and returns rows owned by
    // the current profile.
    const token = await getFirebaseIdToken();
    if (!token) return [] as Booking[];
    const { data, error } = await supabase.functions.invoke('bookings-read', {
      body: { limit: 50 },
      headers: { 'x-firebase-token': token },
    });
    if (error) {
      console.error('Error fetching bookings:', error);
      return [] as Booking[];
    }
    return ((data as any)?.bookings || []) as Booking[];
  },
  staleTime: 30_000, // Cache for 30 seconds
  gcTime: 180_000, // Keep in memory for 3 minutes
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (prev) => prev,
  meta: {
    errorMessage: 'Failed to load bookings'
  }
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
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="pt-safe bg-slate-50 sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-2">
          <div className="text-center">
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
          </div>
        </div>
      </header>
      <section className="flex-1 pb-24">
        <div className="max-w-md mx-auto px-4">
          {/* Tabs */}
          <div className="mb-6">
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
      </section>
    </main>
  );
}