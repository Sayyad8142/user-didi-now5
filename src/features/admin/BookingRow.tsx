import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, CalendarClock, Sparkles, ChefHat, ShowerHead, Check, MapPin, User, Clock, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Timer from "@/components/Timer";
import { useToast } from "@/hooks/use-toast";
import { useNewBookingAlert } from "./useNewBookingAlert";
import { SLAClock } from "./SLAClock";
import { openExternalUrl } from "@/lib/nativeOpen";
import { AssignWorkerSheet } from "./components/AssignWorkerSheet";
function ServiceIcon({ t}:{t:string}) {
  return t==='cook' ? <ChefHat className="h-5 w-5"/> :
         t==='bathroom_cleaning' ? <ShowerHead className="h-5 w-5"/> :
         <Sparkles className="h-5 w-5"/>;
}

export function prettyService(t:string){
  return t==='cook'?'Cook Service':(t==='bathroom_cleaning'?'Bathroom Cleaning':'Maid Service');
}

export default function BookingRow({ 
  b, 
  onClick, 
  onInteracted, 
  slaMinutes = 12 
}: { 
  b: any; 
  onClick?: () => void; 
  onInteracted?: () => void;
  slaMinutes?: number;
}) {
  const [saving, setSaving] = useState(false);
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const { toast } = useToast();
  const { stopSound } = useNewBookingAlert();
  
  const pending = b.status === "pending";
  const createdAt = b.created_at;
  const overdue = pending && (Date.now() - new Date(createdAt).getTime()) > (slaMinutes * 60 * 1000);
  
  const when = b.booking_type === 'instant'
    ? 'Instant (arrive ~10 mins)'
    : `${b.scheduled_date ?? ''} ${b.scheduled_time?.slice(0,5) ?? ''}`.trim();

  function openAssignWorker(e: React.MouseEvent) {
    e.stopPropagation();
    // Immediately stop any playing notification sound
    try { onInteracted?.(); } catch {}
    try { stopSound(); } catch {}
    setAssignSheetOpen(true);
  }

  function handleWorkerAssigned() {
    setAssignSheetOpen(false);
    toast({ title: "Worker assigned successfully" });
    // Refresh the page data if needed
    if (onInteracted) onInteracted();
  }

  async function cancelBooking(e: React.MouseEvent) {
    e.stopPropagation();
    if (saving) return;
    if (!confirm("Cancel this booking? This action cannot be undone.")) return;
    
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_cancel_booking", {
        p_booking_id: b.id,
        p_reason: "admin_cancel"
      });
      if (error) throw error;
      toast({ title: "Booking cancelled successfully" });
    } catch (err: any) {
      toast({ 
        title: "Failed to cancel booking", 
        description: err.message,
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
            Finding Worker
          </Badge>
        );
      case 'assigned':
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
            Worker Assigned
          </Badge>
        );
       case 'completed':
         return (
           <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
             Completed
           </Badge>
         );
       case 'cancelled':
         return (
           <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
             Cancelled
           </Badge>
         );
       default:
         return (
           <Badge variant="outline" className="capitalize">
             {status}
           </Badge>
         );
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border bg-white hover:shadow-md transition-all duration-200 cursor-pointer ${
        overdue 
          ? "border-red-200 ring-2 ring-red-100 bg-red-50/50 shadow-red-100/50" 
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Header Section */}
      <div className={`p-4 ${overdue ? 'bg-red-50/50' : 'bg-gray-50/50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shadow-sm ${
              overdue 
                ? 'bg-red-100 text-red-600' 
                : 'bg-gradient-to-br from-[#ff007a] to-[#e6006a] text-white'
            }`}>
              <ServiceIcon t={b.service_type} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-base">
                {prettyService(b.service_type)}
              </h3>
              <p className="text-sm text-gray-600">
                {b.booking_type === 'instant' ? 'Instant Service' : 'Scheduled'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {overdue && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Overdue</span>
              </div>
            )}
            {getStatusBadge(b.status)}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4 space-y-4">
        {/* Location & Timing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <MapPin className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Location</p>
              <p className="font-semibold text-gray-900 truncate">{b.community}</p>
              <p className="text-sm text-gray-600">Flat {b.flat_no}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Timing</p>
              <p className="font-semibold text-blue-900 text-sm">
                {b.booking_type === 'instant' ? 'Arrive ~10 mins' : when}
              </p>
              <div className="mt-1">
                <Timer since={b.created_at} />
              </div>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
          <User className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Customer</p>
            <p className="font-semibold text-purple-900">{b.cust_name}</p>
            <Button 
              variant="link" 
              className="p-0 h-auto text-purple-700 hover:text-purple-900 font-medium text-sm"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrl(`tel:${b.cust_phone}`);
              }}
            >
              <Phone className="h-4 w-4 mr-1" />
              {b.cust_phone}
            </Button>
          </div>
        </div>

        {/* Maid Tasks */}
        {b.service_type === 'maid' && b.maid_tasks?.length > 0 && (
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl">
            <Sparkles className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Tasks</p>
              <p className="text-sm font-semibold text-green-900">
                {b.maid_tasks.map((t: string) => 
                  t === 'floor_cleaning' ? 'Floor Cleaning' : 'Dish Washing'
                ).join(' + ')}
              </p>
            </div>
          </div>
        )}

        {/* Cook Preferences */}
        {b.service_type === 'cook' && (
          <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl">
            <ChefHat className="h-5 w-5 text-orange-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Preferences</p>
              <p className="text-sm font-semibold text-orange-900">
                Cuisine: {b.cook_cuisine_pref === 'any' ? 'Any' : b.cook_cuisine_pref === 'north' ? 'North Indian' : 'South Indian'} •{' '}
                Gender: {b.cook_gender_pref === 'any' ? 'Any' : b.cook_gender_pref === 'male' ? 'Male' : 'Female'}
              </p>
            </div>
          </div>
        )}

        {/* SLA Clock for pending bookings */}
        {pending && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <SLAClock 
              createdAt={createdAt} 
              slaMinutes={slaMinutes} 
              pending={pending} 
            />
          </div>
        )}
      </div>

       {/* Action Section */}
       <div className="px-4 pb-4">
         <div className="flex gap-2">
           {b.status === "pending" && (
              <Button
                onClick={openAssignWorker}
                disabled={saving}
                className="flex-1 h-12 bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-semibold rounded-xl shadow-md disabled:opacity-60"
              >
                <Check className="h-4 w-4 mr-2" />
                Assign Worker
              </Button>
            )}
           
           {(b.status === "pending" || b.status === "assigned") && (
             <Button
               onClick={cancelBooking}
               disabled={saving}
               variant="destructive"
               className={`${b.status === "pending" ? "h-12" : "flex-1 h-12"} font-semibold rounded-xl shadow-md disabled:opacity-60`}
             >
               {saving ? (
                 <>
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                   Cancelling...
                 </>
               ) : (
                 <>
                   <X className="h-4 w-4 mr-2" />
                   Cancel
                 </>
               )}
             </Button>
           )}
        </div>
       </div>

       {/* Worker Assignment Sheet */}
       <AssignWorkerSheet
         open={assignSheetOpen}
         onClose={() => setAssignSheetOpen(false)}
         booking={b}
         onWorkerAssigned={handleWorkerAssigned}
       />
     </div>
   );
 }