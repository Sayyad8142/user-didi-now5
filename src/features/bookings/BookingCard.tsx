import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { prettyServiceName } from '@/features/booking/utils';
import { formatDateTime } from '@/features/bookings/dt';
import { format } from 'date-fns';
import { PhoneCall, Sparkles, ChefHat, ShowerHead, Clock, User, MapPin, Timer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AssigningProgress from '@/features/bookings/AssigningProgress';
import { useBookingRealtime } from '@/features/bookings/useBookingRealtime';
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
interface BookingCardProps {
  booking: Booking;
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
export function BookingCard({
  booking
}: BookingCardProps) {
  const [assignedWorker, setAssignedWorker] = useState<any>(null);
  const [loadingWorker, setLoadingWorker] = useState(true);
  const [row, setRow] = useState(booking);
  
  // Subscribe to real-time updates for this specific booking
  useBookingRealtime(booking.id, (updatedBooking) => setRow(updatedBooking));
  
  // Load assigned worker
  useEffect(() => {
    let active = true;
    
    const loadAssignedWorker = async () => {
      try {
        const { data, error } = await supabase
          .from("assignments")
          .select(`
            id,
            status,
            created_at,
            worker:workers(id, full_name, phone)
          `)
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: false })
          .limit(1);
          
        if (!active) return;
        
        if (error) {
          console.error("Error loading assigned worker:", error);
          return;
        }
        
        setAssignedWorker(data?.[0] ?? null);
      } catch (err) {
        console.error("Error in loadAssignedWorker:", err);
      } finally {
        if (active) setLoadingWorker(false);
      }
    };
    
    loadAssignedWorker();
    
    return () => {
      active = false;
    };
  }, [booking.id]);
  
  const title = prettyServiceName(booking.service_type);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
          Finding Worker
        </Badge>;
      case 'assigned':
        return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
          Assigned
        </Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
          Completed
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300">
      {/* Header with service and status */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#ff007a] to-[#e6006a] text-white flex items-center justify-center shadow-md">
              {getServiceIcon(booking.service_type)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
              <p className="text-sm text-gray-600">
                {booking.booking_type === 'instant' ? 'Instant' : 'Scheduled'}
              </p>
            </div>
          </div>
          {getStatusBadge(row.status)}
        </div>
      </div>

      {/* Main content */}
      <div className="p-4 space-y-4">
        {/* Location */}
        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
          <MapPin className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Location</p>
            <p className="font-semibold text-gray-900">{booking.community}</p>
            <p className="text-sm text-gray-600">Flat {booking.flat_no}</p>
          </div>
        </div>

        {/* Worker info and phone */}
        {!loadingWorker && assignedWorker?.worker && (
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
            <User className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Worker</p>
              <p className="font-semibold text-blue-900">{assignedWorker.worker.full_name}</p>
              <Button 
                variant="link" 
                className="p-0 h-auto text-blue-700 hover:text-blue-900 font-medium"
                asChild
              >
                <a href={`tel:${assignedWorker.worker.phone}`}>
                  <PhoneCall className="h-4 w-4 mr-1" />
                  {assignedWorker.worker.phone}
                </a>
              </Button>
            </div>
          </div>
        )}

        {/* Time info */}
        {row.status === 'assigned' && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <Timer className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Arrival</p>
              <p className="font-semibold text-emerald-900">~10 minutes</p>
            </div>
          </div>
        )}

        {/* Scheduled time */}
        {booking.scheduled_date && booking.scheduled_time && (
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Scheduled</p>
              <p className="font-semibold text-blue-900">
                {formatDateTime(booking.scheduled_date, booking.scheduled_time)}
              </p>
            </div>
          </div>
        )}

        {/* Status content */}
        {row.status === "pending" && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <AssigningProgress booking={row} />
          </div>
        )}

        {/* Support button */}
        {(row.status === 'pending' || row.status === 'assigned') && (
          <Button 
            asChild 
            className="w-full h-12 bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-semibold rounded-xl shadow-md"
          >
            <a href="tel:+918008180018">
              <PhoneCall className="h-4 w-4 mr-2" />
              Need Help? Call Support
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}