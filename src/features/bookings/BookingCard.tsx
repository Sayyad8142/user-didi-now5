import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { prettyServiceName, serviceIcon } from '@/features/booking/utils';
import { formatDateTime, formatDate } from './dt';
import { format } from 'date-fns';
import { Clock, MapPin, Calendar } from 'lucide-react';

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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { 
    label: 'Pending', 
    variant: 'outline',
    className: 'border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100' 
  },
  assigned: { 
    label: 'Assigned', 
    variant: 'default',
    className: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-button' 
  },
  completed: { 
    label: 'Completed', 
    variant: 'secondary',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200' 
  },
  cancelled: { 
    label: 'Cancelled', 
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200' 
  },
};

export function BookingCard({ booking }: BookingCardProps) {
  const ServiceIcon = serviceIcon(booking.service_type);
  const statusInfo = statusConfig[booking.status] || statusConfig.pending;

  const getTimeText = () => {
    if (booking.booking_type === 'instant') {
      const createdAt = new Date(booking.created_at);
      const time = format(createdAt, 'h:mm a');
      const date = formatDate(booking.created_at);
      return `Requested at ${time} on ${date}`;
    } else {
      return formatDateTime(booking.scheduled_date!, booking.scheduled_time);
    }
  };

  return (
    <Card className="gradient-card shadow-card border-0 rounded-2xl transition-smooth hover:shadow-xl group overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6">
          {/* Header Section */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Enhanced Service Icon */}
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary-glow/20 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                  <ServiceIcon className="w-7 h-7 text-primary" />
                </div>
                {booking.booking_type === 'instant' && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                  </div>
                )}
              </div>
              
              {/* Service Info */}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {prettyServiceName(booking.service_type)}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{getTimeText()}</span>
                </div>
              </div>
            </div>

            {/* Enhanced Status Badge */}
            <Badge 
              variant={statusInfo.variant}
              className={`${statusInfo.className} px-3 py-1 font-medium transition-all duration-200 hover:scale-105`}
            >
              {statusInfo.label}
            </Badge>
          </div>

          {/* Location Info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 border border-border/50">
            <MapPin className="w-4 h-4 text-primary/70" />
            <span className="font-medium">{booking.community}</span>
            <span className="text-muted-foreground/60">•</span>
            <span>{booking.flat_no}</span>
          </div>

          {/* Booking Type Indicator */}
          {booking.booking_type === 'instant' && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Instant Booking</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}