import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PhoneCall } from "lucide-react";
import { prettyService } from "./BookingRow";

export default function BookingDrawer({open,onOpenChange,booking}:{open:boolean; onOpenChange:(v:boolean)=>void; booking:any}) {
  if (!booking) return null;
  const when = booking.booking_type==='instant'
    ? 'Instant (arrive ~10 mins)'
    : `${booking.scheduled_date ?? ''} ${booking.scheduled_time?.slice(0,5) ?? ''}`.trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-2xl mx-auto">
        <SheetHeader>
          <SheetTitle>{prettyService(booking.service_type)}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-3">
          <div className="text-sm">When: <b>{when}</b></div>
          <div className="text-sm">Customer: <b>{booking.cust_name}</b> ({booking.cust_phone})</div>
          <div className="text-sm">Address: {booking.community} • {booking.flat_no}</div>
          {booking.service_type==='cook' ? (
            <div className="text-sm">Family: {booking.family_count ?? '-'} • Food: {booking.food_pref ?? '-'}</div>
          ) : (
            <div className="text-sm">Flat Size: {booking.flat_size ?? '-'}</div>
          )}
          <div className="text-sm">Price: ₹{booking.price_inr ?? '-'}</div>

          <a href={`tel:${booking.cust_phone}`} className="inline-flex items-center justify-center h-11 w-full rounded-full bg-gray-900 text-white gap-2">
            <PhoneCall className="h-4 w-4"/> Call Customer
          </a>
          <a href="tel:+918008180018" className="inline-flex items-center justify-center h-11 w-full rounded-full bg-pink-600 text-white">
            Call Support (8008180018)
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}