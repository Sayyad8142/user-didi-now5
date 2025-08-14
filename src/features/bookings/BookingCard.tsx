import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { prettyServiceName, serviceIcon } from '@/features/booking/utils';
import { formatDateTime, formatDate } from './dt';
import { format } from 'date-fns';

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

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800' },
  assigned: { label: 'Assigned', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800' },
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
    <Card className="bg-white rounded-2xl shadow-md border border-pink-50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Service Icon */}
          <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0">
            <ServiceIcon className="w-5 h-5 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900">
              {prettyServiceName(booking.service_type)}
            </h3>
            <p className="text-sm text-muted-foreground">
              {getTimeText()}
            </p>
            <p className="text-xs text-muted-foreground">
              {booking.community} · {booking.flat_no}
            </p>
          </div>

          {/* Status Badge */}
          <Badge className={statusInfo.className}>
            {statusInfo.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}