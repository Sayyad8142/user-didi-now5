import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchBookingById } from '@/features/bookings/bookingsReadClient';
import { useProfile } from '@/contexts/ProfileContext';
import { BookingCard } from '@/features/bookings/BookingCard';
import { WorkerReachConfirmationCard } from '@/features/bookings/WorkerReachConfirmationCard';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ['booking-detail', profile?.id, id],
    enabled: !!id && !!profile?.id,
    queryFn: async () => {
      if (!id) throw new Error('Booking not found');
      return fetchBookingById(id);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="pt-safe bg-slate-50 sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigate('/bookings')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-primary truncate">Booking Details</h1>
        </div>
      </header>

      {/* Content */}
      <section className="flex-1 pb-24">
        <div className="max-w-md mx-auto px-4 py-4">
          {isLoading && (
            <div className="flex justify-center py-16">
              <CleaningLoader size="lg" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-semibold text-foreground">Booking not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This booking may have been removed or you don't have access.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate('/bookings')}>
                Go to Bookings
              </Button>
            </div>
          )}

          {booking && <BookingCard booking={booking as any} />}
        </div>
      </section>
    </main>
  );
}
