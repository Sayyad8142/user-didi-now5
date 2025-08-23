import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ChefHat, ShowerHead, ArrowRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { prettyServiceName } from '@/features/booking/utils';
import AssigningProgress from '@/features/bookings/AssigningProgress';

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
  worker_name?: string | null;
  assigned_at?: string | null;
  cancel_source?: string | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
}

const getServiceIcon = (serviceType: string) => {
  switch (serviceType) {
    case 'maid':
      return <Sparkles className="w-5 h-5" />;
    case 'cook':
      return <ChefHat className="w-5 h-5" />;
    case 'bathroom_cleaning':
      return <ShowerHead className="w-5 h-5" />;
    default:
      return <Sparkles className="w-5 h-5" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'assigned':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function ActiveBookingCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedBookings, setDismissedBookings] = useState<Set<string>>(new Set());

  const fetchActiveBooking = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .or(`and(status.in.(pending,assigned),booking_type.eq.instant),and(status.in.(pending,assigned),booking_type.eq.scheduled,scheduled_date.gte.${today}),and(status.eq.cancelled,cancel_source.eq.admin,cancelled_at.gte.${thirtyMinutesAgo})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active booking:', error);
      } else {
        setActiveBooking(data || null);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load dismissed bookings from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedBookings');
    if (dismissed) {
      setDismissedBookings(new Set(JSON.parse(dismissed)));
    }
  }, []);

  useEffect(() => {
    fetchActiveBooking();
  }, [user]);

  // Set up real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("active-booking-updates")
      .on("postgres_changes", 
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload) => {
          // Refetch active booking when any booking is updated
          fetchActiveBooking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading || !activeBooking || dismissedBookings.has(activeBooking.id)) {
    return null;
  }

  const handleViewDetails = () => {
    navigate('/bookings');
  };

  const handleDismiss = () => {
    const newDismissed = new Set(dismissedBookings);
    newDismissed.add(activeBooking.id);
    setDismissedBookings(newDismissed);
    localStorage.setItem('dismissedBookings', JSON.stringify([...newDismissed]));
  };

  return (
    <Card className={`p-4 border-2 ${
      activeBooking.status === 'assigned' 
        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
        : 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            activeBooking.status === 'assigned' ? 'bg-green-100' : 'bg-primary/10'
          }`}>
            {getServiceIcon(activeBooking.service_type)}
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {prettyServiceName(activeBooking.service_type)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {activeBooking.community} • {activeBooking.flat_no}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${getStatusColor(activeBooking.status)}`}>
            {activeBooking.status === 'pending' ? 'Finding Worker' : 
             activeBooking.status === 'assigned' ? '✓ Worker Assigned' : 
             activeBooking.status}
          </Badge>
          {activeBooking.status === "cancelled" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="p-1 h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {activeBooking.worker_name && (
        <div className="mb-3">
          <p className="text-sm font-medium">Worker: {activeBooking.worker_name}</p>
        </div>
      )}

      {activeBooking.status === 'pending' && (
        <AssigningProgress booking={activeBooking} />
      )}

      {/* Admin cancellation message */}
      {activeBooking.status === "cancelled" && activeBooking.cancel_source === "admin" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <p className="text-red-800 font-medium text-sm">
            Booking cancelled by admin - we are unable to provide helper this time. Please try again next time.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-muted-foreground">
          {activeBooking.booking_type === 'instant' ? 'Instant Booking' : 'Scheduled Booking'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewDetails}
          className="text-primary hover:text-primary/80"
        >
          View Details
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </Card>
  );
}