import { useState } from "react";
import { 
  MapPin, 
  Clock, 
  User, 
  Phone, 
  Sparkles, 
  ChefHat, 
  ShowerHead, 
  X,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Users,
  Building2,
  AlertCircle,
  Clock as TimerIcon,
  UserCheck,
  Calendar,
  Zap,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { openExternalUrl } from "@/lib/nativeOpen";
import TimerComponent from "@/components/Timer";
import { AssignWorkerSheet } from "./AssignWorkerSheet";
import { cn } from "@/lib/utils";
import { formatTime } from "@/features/bookings/dt";

interface AdminBookingCardProps {
  booking: any;
  slaMinutes?: number;
  onCancel?: () => void;
  onUpdate?: (booking: any) => void;
}

// Service configuration with modern gradients and icons
function getServiceConfig(serviceType: string) {
  switch (serviceType) {
    case 'cook':
      return {
        icon: ChefHat,
        gradient: 'from-orange-400 via-red-400 to-pink-400',
        bgGradient: 'from-orange-50/50 via-red-50/30 to-pink-50/50',
        accentColor: 'orange',
        name: 'Cook Service'
      };
    case 'bathroom_cleaning':
      return {
        icon: ShowerHead,
        gradient: 'from-blue-400 via-cyan-400 to-teal-400',
        bgGradient: 'from-blue-50/50 via-cyan-50/30 to-teal-50/50',
        accentColor: 'blue',
        name: 'Bathroom Cleaning'
      };
    default:
      return {
        icon: Sparkles,
        gradient: 'from-purple-400 via-pink-400 to-rose-400',
        bgGradient: 'from-purple-50/50 via-pink-50/30 to-rose-50/50',
        accentColor: 'purple',
        name: 'Maid Service'
      };
  }
}

// Enhanced status chip with animations and gradients
function StatusChip({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold shadow-lg animate-pulse">
        <AlertCircle className="w-3 h-3" />
        <span>SLA BREACH</span>
      </div>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-lg">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span>FINDING WORKER</span>
        </div>
      );
    case 'assigned':
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-green-400 text-white text-xs font-bold shadow-lg">
          <CheckCircle2 className="w-3 h-3" />
          <span>ASSIGNED</span>
        </div>
      );
    case 'completed':
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold shadow-lg">
          <CheckCircle2 className="w-3 h-3" />
          <span>COMPLETED</span>
        </div>
      );
    case 'cancelled':
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-gray-400 to-slate-400 text-white text-xs font-bold shadow-lg">
          <XCircle className="w-3 h-3" />
          <span>CANCELLED</span>
        </div>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs font-medium capitalize px-3 py-1">
          {status}
        </Badge>
      );
  }
}

// Modern info card with compact design
function InfoCard({ 
  icon: Icon, 
  title, 
  value, 
  sub,
  accent = 'purple'
}: { 
  icon: any; 
  title: string; 
  value: string; 
  sub?: React.ReactNode;
  accent?: string;
}) {
  const accentGradients = {
    purple: 'from-purple-400 to-pink-400',
    orange: 'from-orange-400 to-red-400',
    blue: 'from-blue-400 to-cyan-400',
    green: 'from-emerald-400 to-green-400'
  };

  return (
    <div className="group relative overflow-hidden rounded-xl bg-white/80 backdrop-blur-sm border border-gray-200/50 p-3 transition-all duration-200 hover:shadow-md hover:bg-white">
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-md flex-shrink-0 transition-transform group-hover:scale-105",
          accentGradients[accent as keyof typeof accentGradients] || accentGradients.purple
        )}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            {title}
          </div>
          <div className="font-bold text-gray-900 text-sm leading-tight mb-0.5">
            {value}
          </div>
          {sub && (
            <div className="text-xs text-gray-600 leading-snug">
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact SLA progress with better visual feedback
function SlaProgress({ booking, pending }: { booking: any; pending: boolean }) {
  if (!pending) return null;

  const createdAt = new Date(booking.created_at).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, now - createdAt);
  const slaMs = 12 * 60 * 1000; // 12 minutes in milliseconds
  const progress = Math.min(100, (elapsed / slaMs) * 100);
  
  const getProgressState = () => {
    if (progress >= 100) return { color: 'from-red-500 to-red-600', text: 'OVERDUE', bgColor: 'bg-red-50' };
    if (progress >= 80) return { color: 'from-amber-400 to-orange-500', text: 'CRITICAL', bgColor: 'bg-amber-50' };
    if (progress >= 60) return { color: 'from-yellow-400 to-amber-400', text: 'WARNING', bgColor: 'bg-yellow-50' };
    return { color: 'from-emerald-400 to-green-500', text: 'ON TRACK', bgColor: 'bg-green-50' };
  };

  const state = getProgressState();
  const timeRemaining = Math.max(0, 12 - (elapsed / (60 * 1000)));

  return (
    <div className={cn("mt-2 p-2 rounded-xl border transition-all duration-200", state.bgColor)}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">SLA</span>
        <div className={cn(
          "px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-md",
          `bg-gradient-to-r ${state.color}`
        )}>
          {state.text}
        </div>
      </div>
      
      <div className="relative h-1.5 bg-gray-200/60 rounded-full overflow-hidden mb-1.5">
        <div 
          className={cn("h-full bg-gradient-to-r transition-all duration-500", state.color)}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-gray-600">
        <span>{Math.round(elapsed / (60 * 1000))}m</span>
        <span>
          {timeRemaining > 0 ? `${Math.round(timeRemaining)}m left` : 'Overdue'}
        </span>
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
    .join(' • ');
}

function humanEta(booking: any) {
  if (booking.booking_type === 'instant') {
    return 'Arrive ~10 mins';
  }
  if (booking.scheduled_date && booking.scheduled_time) {
    const timeFormatted = formatTime(booking.scheduled_time.slice(0, 5));
    return `${booking.scheduled_date} at ${timeFormatted}`;
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

  const serviceConfig = getServiceConfig(booking.service_type);

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
      <Card className="group relative overflow-hidden rounded-2xl border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white">
        {/* Gradient background overlay */}
        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-5", serviceConfig.bgGradient)} />
        
        <CardContent className="relative p-2.5">
          {/* Mobile-optimized header */}
          <div className="flex items-start gap-2.5 mb-2.5">
            <div className={cn(
              "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md flex-shrink-0",
              serviceConfig.gradient
            )}>
              <serviceConfig.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 leading-tight">
                    {serviceConfig.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                    <Calendar className="w-3 h-3" />
                    <span className="font-medium">
                      {booking.booking_type === 'instant' ? 'Instant' : 'Scheduled'}
                    </span>
                    {booking.booking_type === 'instant' && (
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span className="text-xs font-bold text-amber-600">RUSH</span>
                      </div>
                    )}
                  </div>
                </div>
                <StatusChip status={booking.status} overdue={overdue} />
              </div>
            </div>
          </div>

          {/* Compact info grid - Mobile stacked */}
          <div className="space-y-1.5 mb-2">
            <div className="flex items-center gap-3 p-1.5 bg-gray-50/60 rounded-xl">
              <div className={cn(
                "w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                serviceConfig.gradient
              )}>
                <Building2 className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</div>
                <div className="font-semibold text-sm text-gray-900 truncate">
                  {booking.community} • Flat {booking.flat_no}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-1.5 bg-gray-50/60 rounded-xl">
              <div className={cn(
                "w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                serviceConfig.gradient
              )}>
                <Clock className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timing</div>
                <div className="font-semibold text-sm text-gray-900">
                  {humanEta(booking)}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-gray-400">•</span>
                  <TimerComponent since={booking.created_at} />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-1.5 bg-gray-50/60 rounded-xl">
              <div className={cn(
                "w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                serviceConfig.gradient
              )}>
                <User className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</div>
                <div className="font-semibold text-sm text-gray-900 truncate">
                  {booking.cust_name}
                </div>
                <a 
                  href={`tel:${booking.cust_phone}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternalUrl(`tel:${booking.cust_phone}`);
                  }}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors text-xs font-medium mt-0.5"
                >
                  <Phone className="h-3 w-3" />
                  {booking.cust_phone}
                </a>
              </div>
            </div>

            {booking.service_type === 'maid' && booking.maid_tasks?.length > 0 && (
              <div className="flex items-center gap-3 p-1.5 bg-gray-50/60 rounded-xl">
                <div className={cn(
                  "w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                  serviceConfig.gradient
                )}>
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tasks</div>
                  <div className="font-semibold text-sm text-gray-900">
                    {formatMaidTasks(booking)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SLA Progress */}
          <SlaProgress booking={booking} pending={isPending} />

          {/* Worker assignment card */}
          {isAssigned && booking.worker_name && (
            <div className="mt-2">
              <button
                className="w-full group/worker rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 p-2 hover:from-emerald-100 hover:to-green-100 transition-all duration-200 text-left hover:shadow-md"
                onClick={() => setSheetOpen(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-md">
                    <Users className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-emerald-900 text-sm">
                      {booking.worker_name}
                    </div>
                    <div className="text-xs text-emerald-700 font-medium">
                      Assigned • Tap to reassign
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-600 group-hover/worker:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </div>
          )}

          {/* Action Buttons - Always visible */}
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 font-medium h-9 rounded-lg transition-all"
              onClick={handleCancel}
              disabled={saving}
            >
              {saving ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-red-400 border-t-red-600 rounded-full animate-spin" />
                  <span className="text-xs">Cancelling...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-3 w-3" />
                  <span className="text-xs font-medium">Cancel</span>
                </div>
              )}
            </Button>
            
            <Button
              size="sm"
              className={cn(
                "flex-1 rounded-lg font-medium h-9 text-white shadow-sm transition-all bg-gradient-to-r",
                isAssigned
                  ? "from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  : serviceConfig.gradient
              )}
              onClick={() => setSheetOpen(true)}
              disabled={saving}
            >
              <div className="flex items-center gap-1.5">
                <UserCheck className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {isAssigned ? 'Reassign' : 'Assign'}
                </span>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <AssignWorkerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        booking={booking}
        onWorkerAssigned={handleWorkerAssigned}
      />
    </>
  );
}