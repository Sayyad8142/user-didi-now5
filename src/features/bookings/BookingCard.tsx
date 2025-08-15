import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { prettyServiceName } from '@/features/booking/utils';
import { PhoneCall, Sparkles, ChefHat, ShowerHead } from 'lucide-react';

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

export function BookingCard({ booking }: BookingCardProps) {
  const title = prettyServiceName(booking.service_type);

  return (
    <Card className="bg-white rounded-2xl shadow-md border border-pink-50 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-pink-100 text-[#ff007a] flex items-center justify-center">
          {getServiceIcon(booking.service_type)}
        </div>
        <div className="text-base font-semibold">{title}</div>
      </div>

      <p className="text-sm text-gray-700">
        Booking confirmed — worker will arrive in 10 mins to your flat.
      </p>

      {/* CTA visible only for upcoming (pending/assigned) */}
      {(booking.status === 'pending' || booking.status === 'assigned') && (
        <Button asChild className="h-11 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] text-white font-semibold w-full">
          <a
            href="tel:+918008180018"
            target="_self"
            rel="noopener"
            aria-label="Call Support +91 8008180018"
          >
            <span className="inline-flex items-center gap-2">
              <PhoneCall className="h-4 w-4" />
              Worker not arrived? Call Support
            </span>
          </a>
        </Button>
      )}
    </Card>
  );
}