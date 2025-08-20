import { useState } from "react";
import { MapPin, Clock, User, Phone, Sparkles, ChefHat, ShowerHead, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { openExternalUrl } from "@/lib/nativeOpen";
import Timer from "@/components/Timer";
import { AssignWorkerSheet } from "./AssignWorkerSheet";
import { SLAClock } from "../SLAClock";

interface AdminBookingCardProps {
  booking: any;
  slaMinutes?: number;
  onCancel?: () => void;
  onUpdate?: (booking: any) => void;
}

function ServiceIcon({ serviceType }: { serviceType: string }) {
  switch (serviceType) {
    case 'cook':
      return <ChefHat className="h-5 w-5" />;
    case 'bathroom_cleaning':
      return <ShowerHead className="h-5 w-5" />;
    default:
      return <Sparkles className="h-5 w-5" />;
  }
}

function prettyService(serviceType: string) {
  switch (serviceType) {
    case 'cook':
      return 'Cook Service';
    case 'bathroom_cleaning':
      return 'Bathroom Cleaning';
    default:
      return 'Maid Service';
  }
}

function StatusChip({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">
        SLA
      </Badge>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs font-medium">
          Finding Worker
        </Badge>
      );
    case 'assigned':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs font-medium">
          Assigned
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs font-medium capitalize">
          {status}
        </Badge>
      );
  }
}

function InfoRow({ 
  icon: Icon, 
  title, 
  value, 
  sub 
}: { 
  icon: any; 
  title: string; 
  value: string; 
  sub?: React.ReactNode; 
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-500 mt-1 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
          {title}
        </p>
        <p className="text-sm font-semibold text-slate-900 break-words">
          {value}
        </p>
        {sub && (
          <div className="text-xs text-slate-600 mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function SlaBar({ booking, pending }: { booking: any; pending: boolean }) {
  if (!pending) return null;

  const createdAt = new Date(booking.created_at).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, now - createdAt);
  const slaMs = 12 * 60 * 1000; // 12 minutes in milliseconds
  const progress = Math.min(100, (elapsed / slaMs) * 100);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>SLA Progress</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div 
          className="h-full bg-pink-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function formatMaidTasks(booking: any) {
  if (!booking.maid_tasks?.length) return '';
  return booking.maid_tasks
    .map((task: string) => {
      switch (task) {
        case 'floor_cleaning':
          return 'Floor Cleaning';
        case 'dish_washing':
          return 'Dish Washing';
        default:
          return task;
      }
    })
    .join(' + ');
}

function humanEta(booking: any) {
  if (booking.booking_type === 'instant') {
    return 'Arrive ~10 mins';
  }
  if (booking.scheduled_date && booking.scheduled_time) {
    return `${booking.scheduled_date} at ${booking.scheduled_time.slice(0, 5)}`;
  }
  return 'Scheduled';
}

export function AdminBookingCard({ 
  booking, 
  slaMinutes = 12, 
  onCancel, 
  onUpdate 
}: AdminBookingCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isAssigned = booking.status === 'assigned';
  const isPending = booking.status === 'pending';
  const createdAt = new Date(booking.created_at).getTime();
  const now = Date.now();
  const overdue = isPending && (now - createdAt) > (slaMinutes * 60 * 1000);

  const handleCancel = async () => {
    if (!confirm("Cancel this booking? This action cannot be undone.")) return;
    
    setSaving(true);
    try {
      const { error } = await supabaseAdmin.rpc("admin_cancel_booking", {
        p_booking_id: booking.id,
        p_reason: "admin_cancel"
      });
      
      if (error) throw error;
      
      toast({ title: "Booking cancelled successfully" });
      onCancel?.();
    } catch (err: any) {
      toast({ 
        title: "Failed to cancel booking", 
        description: err.message,
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleWorkerAssigned = (worker: any) => {
    const updatedBooking = {
      ...booking,
      status: 'assigned',
      worker_id: worker.id,
      worker_name: worker.full_name,
      worker_phone: worker.phone,
      assigned_at: new Date().toISOString()
    };
    onUpdate?.(updatedBooking);
    setSheetOpen(false);
  };

  return (
    <>
      <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-pink-100 text-pink-600">
              <ServiceIcon serviceType={booking.service_type} />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-900">
                {prettyService(booking.service_type)}
              </div>
              <div className="text-xs text-slate-500">
                {booking.booking_type === 'instant' ? 'Instant Service' : 'Scheduled Service'}
              </div>
            </div>
          </div>
          <StatusChip status={booking.status} overdue={overdue} />
        </div>

        {/* Info blocks */}
        <div className="space-y-3">
          <InfoRow 
            icon={MapPin} 
            title="LOCATION" 
            value={booking.community} 
            sub={`Flat ${booking.flat_no}`} 
          />
          
          <InfoRow 
            icon={Clock} 
            title="TIMING" 
            value={humanEta(booking)} 
            sub={
              <div className="flex items-center gap-2">
                <span>•</span>
                <Timer since={booking.created_at} />
              </div>
            }
          />
          
          <InfoRow 
            icon={User} 
            title="CUSTOMER" 
            value={booking.cust_name} 
            sub={
              <a 
                href={`tel:${booking.cust_phone}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrl(`tel:${booking.cust_phone}`);
                }}
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 w-fit"
              >
                <Phone className="h-3 w-3" />
                {booking.cust_phone}
              </a>
            }
          />

          {booking.service_type === 'maid' && booking.maid_tasks?.length > 0 && (
            <InfoRow 
              icon={Sparkles} 
              title="TASKS" 
              value={formatMaidTasks(booking)} 
            />
          )}
        </div>

        {/* SLA Progress */}
        <SlaBar booking={booking} pending={isPending} />

        {/* Worker chip when assigned */}
        {isAssigned && booking.worker_name && (
          <div className="mt-3">
            <button 
              className="rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
              onClick={() => setSheetOpen(true)}
            >
              Worker: {booking.worker_name} (tap to change)
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full border-slate-200 text-slate-700 py-3 h-11 min-w-0"
            onClick={handleCancel}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin mr-2" />
                <span className="hidden sm:inline">Cancelling...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Cancel</span>
              </>
            )}
          </Button>
          
          <Button
            className="flex-1 rounded-full bg-pink-600 text-white py-3 h-11 hover:bg-pink-700 min-w-0"
            onClick={() => setSheetOpen(true)}
            disabled={saving}
          >
            <span className="hidden sm:inline">
              {isAssigned ? 'Reassign Worker' : 'Confirm Assignment'}
            </span>
            <span className="sm:hidden text-xs">
              {isAssigned ? 'Reassign' : 'Confirm'}
            </span>
          </Button>
        </div>
      </div>

      <AssignWorkerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        booking={booking}
        onWorkerAssigned={handleWorkerAssigned}
      />
    </>
  );
}