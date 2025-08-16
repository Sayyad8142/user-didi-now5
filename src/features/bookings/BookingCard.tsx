import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { prettyServiceName } from '@/features/booking/utils';
import { formatDateTime } from '@/features/bookings/dt';
import { format } from 'date-fns';
import { PhoneCall, Sparkles, ChefHat, ShowerHead, Clock } from 'lucide-react';
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
  const title = prettyServiceName(booking.service_type);
  return <Card className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-xl border-0 p-6 space-y-4 hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-50/30 via-transparent to-purple-50/20 pointer-events-none" />
      
      {/* Header Section */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-100 to-pink-50 text-[#ff007a] flex items-center justify-center shadow-lg ring-2 ring-pink-100/50">
            {getServiceIcon(booking.service_type)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
            
          </div>
        </div>
      </div>

      {/* Time Information Section */}
      <div className="relative bg-gradient-to-r from-gray-50 to-gray-50/70 rounded-2xl px-4 py-3 space-y-2.5">
        {/* Scheduled Time */}
        {booking.scheduled_date && booking.scheduled_time && <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Scheduled</p>
              <p className="text-sm font-semibold text-gray-800">
                {formatDateTime(booking.scheduled_date, booking.scheduled_time)}
              </p>
            </div>
          </div>}

        {/* Booking Created Time */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booked</p>
            <p className="text-sm font-semibold text-gray-800">
              {format(new Date(booking.created_at), 'dd MMM yyyy, h:mm a')}
            </p>
          </div>
        </div>
      </div>

      {/* Status Message */}
      <div className="relative">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl px-4 py-3">
          <p className="text-sm font-medium text-emerald-800 text-center">
            ✨ Booking confirmed — worker will arrive in 10 mins to your flat
          </p>
        </div>
      </div>

      {/* Address Information */}
      

      {/* CTA Button */}
      {(booking.status === 'pending' || booking.status === 'assigned') && <div className="relative pt-2">
          <Button asChild className="h-12 rounded-2xl bg-gradient-to-r from-[#ff007a] via-[#e6006a] to-[#d9006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-bold w-full shadow-lg hover:shadow-xl transition-all duration-300 border-0">
            <a href="tel:+918008180018" target="_self" rel="noopener" aria-label="Call Support +91 8008180018">
              <span className="inline-flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                  <PhoneCall className="h-4 w-4" />
                </div>
                Worker not arrived? Call Support
              </span>
            </a>
          </Button>
        </div>}
    </Card>;
}