import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneCall, UserPlus, CheckCircle, XCircle, MessageCircle } from "lucide-react";
import { prettyService } from "./BookingRow";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNewBookingAlert } from "./useNewBookingAlert";
import { HistoryList } from "./HistoryList";
import { AssignWorkerModal } from "./AssignWorkerModal";
import AdminChatPanel from "@/features/chat/AdminChatPanel";
import { useState, useEffect } from "react";
import { openExternalUrl } from "@/lib/nativeOpen";

type Worker = {
  id: string;
  full_name: string;
  phone: string;
  service_types: string[];
  community: string | null;
  is_active: boolean;
};

export default function BookingDrawer({open,onOpenChange,booking}:{open:boolean; onOpenChange:(v:boolean)=>void; booking:any}) {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [latestAssignment, setLatestAssignment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("details");
  const { toast } = useToast();
  const { stopSound } = useNewBookingAlert();

  // Load latest assignment when booking changes
  useEffect(() => {
    let active = true;
    
    const loadLatestAssignment = async () => {
      if (!booking?.id) {
        setLatestAssignment(null);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("assignments")
          .select(`
            id,
            status,
            created_at,
            worker:workers(id, full_name, phone, community)
          `)
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: false })
          .limit(1);
          
        if (!active) return;
        
        if (error) {
          console.error("Error loading assignment:", error);
          return;
        }
        
        setLatestAssignment(data?.[0] ?? null);
      } catch (err) {
        console.error("Error in loadLatestAssignment:", err);
      }
    };
    
    loadLatestAssignment();
    
    return () => {
      active = false;
    };
  }, [booking?.id]);

  if (!booking) return null;
  
  const when = booking.booking_type==='instant'
    ? 'Instant (arrive ~10 mins)'
    : `${booking.scheduled_date ?? ''} ${booking.scheduled_time?.slice(0,5) ?? ''}`.trim();
  const handleAssignmentComplete = (payload: { worker: any }) => {
    setLatestAssignment({
      worker: payload.worker,
      created_at: new Date().toISOString(),
      status: "assigned"
    });
    stopSound(); // Stop any playing notification sound
  };

  const handleMarkComplete = async () => {
    if (!booking?.id || isMarkingComplete) return;
    
    setIsMarkingComplete(true);
    try {
      const { error } = await supabase.rpc("admin_set_booking_status", {
        p_booking_id: booking.id,
        p_new_status: "completed",
        p_note: "Marked completed by admin"
      });

      if (error) throw error;

      toast({ title: "Booking marked as completed!" });
      stopSound(); // Stop any playing notification sound
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error marking complete:', error);
      toast({ title: "Failed to mark as completed", description: error.message, variant: "destructive" });
    } finally {
      setIsMarkingComplete(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!booking?.id || isCancelling) return;
    
    setIsCancelling(true);
    try {
      const { error } = await supabase.rpc("admin_set_booking_status", {
        p_booking_id: booking.id,
        p_new_status: "cancelled",
        p_note: cancelReason || "Cancelled by admin"
      });

      if (error) throw error;

      toast({ title: "Booking cancelled successfully!" });
      stopSound(); // Stop any playing notification sound
      setCancelModalOpen(false);
      setCancelReason("");
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast({ title: "Failed to cancel booking", description: error.message, variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-2xl mx-auto h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>{prettyService(booking.service_type)}</SheetTitle>
        </SheetHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="flex-1 overflow-y-auto">
            <div className="space-y-3 py-3">
          <div className="text-sm">When: <b>{when}</b></div>
          <div className="text-sm">Customer: <b>{booking.cust_name}</b> ({booking.cust_phone})</div>
          <div className="text-sm">Address: {booking.community} • {booking.flat_no}</div>
          {booking.service_type==='cook' ? (
            <div className="space-y-1">
              <div className="text-sm">Family: {booking.family_count ?? '-'} • Food: {booking.food_pref ?? '-'}</div>
              <div className="text-sm">
                <span className="font-medium">Cuisine Pref:</span>{' '}
                {booking.cook_cuisine_pref === 'any' ? 'Anyone is fine'
                  : booking.cook_cuisine_pref === 'north' ? 'North Indian' : 'South Indian'}
              </div>
              <div className="text-sm">
                <span className="font-medium">Gender Pref:</span>{' '}
                {booking.cook_gender_pref === 'any' ? 'Anyone is fine'
                  : booking.cook_gender_pref === 'male' ? 'Male' : 'Female'}
              </div>
            </div>
          ) : (
            <div className="text-sm">Flat Size: {booking.flat_size ?? '-'}</div>
          )}
          <div className="text-sm">Price: ₹{booking.price_inr ?? '-'}</div>
          <div className="text-sm">Status: <b className="capitalize">{booking.status}</b></div>

          {/* Assignment Section */}
          <div className="bg-muted/30 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold">Worker Assignment</div>
            {latestAssignment ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Assigned to:</span>
                  <div className="font-medium">{latestAssignment.worker?.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {latestAssignment.worker?.phone}
                    {latestAssignment.worker?.community && ` • ${latestAssignment.worker.community}`}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Assigned: {new Date(latestAssignment.created_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No worker assigned yet</div>
            )}
            <Button
              onClick={() => setAssignModalOpen(true)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {latestAssignment ? "Reassign Worker" : "Assign Worker"}
            </Button>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button 
              onClick={handleMarkComplete}
              disabled={booking.status === 'completed' || isMarkingComplete}
              className="h-11 rounded-full"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isMarkingComplete ? 'Completing...' : 'Mark Complete'}
            </Button>

            <Button 
              onClick={() => setCancelModalOpen(true)}
              disabled={booking.status === 'completed' || booking.status === 'cancelled'}
              variant="destructive"
              className="h-11 rounded-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Booking
            </Button>
          </div>

          {/* Communication Actions */}
          <div className="space-y-2 pt-2">
            <button onClick={() => openExternalUrl(`tel:${booking.cust_phone}`)} className="inline-flex items-center justify-center h-11 w-full rounded-full bg-gray-900 text-white gap-2">
              <PhoneCall className="h-4 w-4"/> Call Customer
            </button>
            <button onClick={() => openExternalUrl("tel:+918008180018")} className="inline-flex items-center justify-center h-11 w-full rounded-full bg-pink-600 text-white">
              Call Support (8008180018)
            </button>
          </div>

              {/* Status History */}
              <div className="border-t pt-3 mt-4">
                <div className="text-sm font-semibold mb-3">Status History</div>
                <HistoryList bookingId={booking.id} />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="chat" className="flex-1 flex flex-col">
            <div className="flex-1 border rounded-xl overflow-hidden">
              <AdminChatPanel booking={booking} />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>

      {/* Assign Worker Modal */}
      <AssignWorkerModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        booking={booking}
        onAssigned={handleAssignmentComplete}
      />

      {/* Cancel Booking Modal */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Add an optional reason for cancellation (visible in admin history)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
                Close
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancelBooking} 
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}