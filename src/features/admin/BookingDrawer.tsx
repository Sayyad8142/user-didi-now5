import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, UserPlus, CheckCircle } from "lucide-react";
import { prettyService } from "./BookingRow";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNewBookingAlert } from "./useNewBookingAlert";
import { HistoryList } from "./HistoryList";
import { useState, useEffect } from "react";

type Worker = {
  id: string;
  full_name: string;
  phone: string;
  service_types: string[];
  community: string | null;
  is_active: boolean;
};

export default function BookingDrawer({open,onOpenChange,booking}:{open:boolean; onOpenChange:(v:boolean)=>void; booking:any}) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const { toast } = useToast();
  const { stopSound } = useNewBookingAlert();

  // Load available workers
  useEffect(() => {
    if (open && booking?.service_type) {
      loadWorkers();
    }
  }, [open, booking?.service_type]);

  const loadWorkers = async () => {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('is_active', true)
      .filter('service_types', 'cs', `{${booking.service_type}}`)
      .order('full_name');
    
    if (error) {
      console.error('Error loading workers:', error);
      return;
    }
    setWorkers(data || []);
  };

  if (!booking) return null;
  
  const when = booking.booking_type==='instant'
    ? 'Instant (arrive ~10 mins)'
    : `${booking.scheduled_date ?? ''} ${booking.scheduled_time?.slice(0,5) ?? ''}`.trim();
  const handleAssignWorker = async () => {
    if (!selectedWorker) {
      toast({ title: "Please select a worker", variant: "destructive" });
      return;
    }

    setIsAssigning(true);
    try {
      // Insert assignment
      const { error: assignError } = await supabase
        .from('assignments')
        .insert({
          booking_id: booking.id,
          worker_id: selectedWorker,
          status: 'assigned'
        });

      if (assignError) throw assignError;

      // Update booking status
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'assigned' })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      toast({ title: "Worker assigned successfully!" });
      stopSound(); // Stop any playing notification sound
      setAssignModalOpen(false);
      setSelectedWorker('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning worker:', error);
      toast({ title: "Failed to assign worker", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleMarkComplete = async () => {
    setIsMarkingComplete(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', booking.id);

      if (error) throw error;

      toast({ title: "Booking marked as completed!" });
      stopSound(); // Stop any playing notification sound
      onOpenChange(false);
    } catch (error) {
      console.error('Error marking complete:', error);
      toast({ title: "Failed to mark as completed", variant: "destructive" });
    } finally {
      setIsMarkingComplete(false);
    }
  };

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
          <div className="text-sm">Status: <b className="capitalize">{booking.status}</b></div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="h-11 rounded-full" 
                  disabled={booking.status === 'assigned' || booking.status === 'completed'}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Worker
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Assign Worker</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Select Worker</label>
                    <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Choose a worker..." />
                      </SelectTrigger>
                      <SelectContent>
                        {workers.map((worker) => (
                          <SelectItem key={worker.id} value={worker.id}>
                            {worker.full_name} ({worker.phone})
                            {worker.community && ` • ${worker.community}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setAssignModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAssignWorker}
                      disabled={isAssigning || !selectedWorker}
                    >
                      {isAssigning ? 'Assigning...' : 'Assign'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={handleMarkComplete}
              disabled={booking.status === 'completed' || isMarkingComplete}
              variant="outline"
              className="h-11 rounded-full"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isMarkingComplete ? 'Completing...' : 'Mark Complete'}
            </Button>
          </div>

          {/* Communication Actions */}
          <div className="space-y-2 pt-2">
            <a href={`tel:${booking.cust_phone}`} className="inline-flex items-center justify-center h-11 w-full rounded-full bg-gray-900 text-white gap-2">
              <PhoneCall className="h-4 w-4"/> Call Customer
            </a>
            <a href="tel:+918008180018" className="inline-flex items-center justify-center h-11 w-full rounded-full bg-pink-600 text-white">
              Call Support (8008180018)
            </a>
          </div>

          {/* Status History */}
          <div className="border-t pt-3 mt-4">
            <div className="text-sm font-semibold mb-3">Status History</div>
            <HistoryList bookingId={booking.id} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}