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
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold shadow-lg animate-pulse">
        <AlertCircle className="w-3 h-3" />
        <span>SLA BREACH</span>
      </div>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-lg">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span>FINDING WORKER</span>
        </div>
      );
    case 'assigned':
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-400 text-white text-xs font-bold shadow-lg">
          <CheckCircle2 className="w-3 h-3" />
          <span>ASSIGNED</span>
        </div>
      );
    case 'completed':
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold shadow-lg">
          <CheckCircle2 className="w-3 h-3" />
          <span>COMPLETED</span>
        </div>
      );
    case 'cancelled':
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-gray-400 to-slate-400 text-white text-xs font-bold shadow-lg">
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

// Modern info card with glassmorphism effect
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
    <div className="group relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-200/50 p-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] hover:bg-white">
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 transition-transform group-hover:scale-110",
          accentGradients[accent as keyof typeof accentGradients] || accentGradients.purple
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            {title}
          </div>
          <div className="font-bold text-gray-900 text-sm leading-snug mb-1">
            {value}
          </div>
          {sub && (
            <div className="text-xs text-gray-600 leading-relaxed">
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced SLA progress with better visual feedback
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
    <div className={cn("mt-4 p-4 rounded-2xl border transition-all duration-300", state.bgColor)}>
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-600" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">SLA Monitor</span>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg",
          `bg-gradient-to-r ${state.color}`
        )}>
          {state.text}
        </div>
      </div>
      
      <div className="relative h-3 bg-gray-200/60 rounded-full overflow-hidden mb-2">
        <div 
          className={cn("h-full bg-gradient-to-r transition-all duration-500", state.color)}
          style={{ width: `${progress}%` }}
        />
        {progress >= 80 && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
        )}
      </div>
      
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-semibold">{Math.round(elapsed / (60 * 1000))}m elapsed</span>
        <span className="font-semibold">
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
      <Card className="group relative overflow-hidden rounded-3xl border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] bg-white">
        {/* Gradient background overlay */}
        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-5", serviceConfig.bgGradient)} />
        
        <CardContent className="relative p-6">
          {/* Header with enhanced styling */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-xl flex-shrink-0 transition-transform group-hover:scale-110",
                serviceConfig.gradient
              )}>
                <serviceConfig.icon className="w-7 h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {serviceConfig.name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">
                    {booking.booking_type === 'instant' ? 'Instant Service' : 'Scheduled Service'}
                  </span>
                  {booking.booking_type === 'instant' && (
                    <div className="flex items-center gap-1 ml-2">
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span className="text-xs font-bold text-amber-600">RUSH</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <StatusChip status={booking.status} overdue={overdue} />
          </div>

          {/* Info grid with modern cards */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            <InfoCard 
              icon={Building2} 
              title="LOCATION" 
              value={booking.community} 
              sub={`Flat ${booking.flat_no}`}
              accent={serviceConfig.accentColor}
            />
            
            <InfoCard 
              icon={Clock} 
              title="TIMING & STATUS" 
              value={humanEta(booking)} 
              sub={
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-400">•</span>
                  <TimerComponent since={booking.created_at} />
                </div>
              }
              accent={serviceConfig.accentColor}
            />
            
            <InfoCard 
              icon={User} 
              title="CUSTOMER INFO" 
              value={booking.cust_name} 
              sub={
                <a 
                  href={`tel:${booking.cust_phone}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternalUrl(`tel:${booking.cust_phone}`);
                  }}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors font-semibold mt-1 group/phone"
                >
                  <Phone className="h-3 w-3 group-hover/phone:scale-110 transition-transform" />
                  {booking.cust_phone}
                </a>
              }
              accent={serviceConfig.accentColor}
            />

            {booking.service_type === 'maid' && booking.maid_tasks?.length > 0 && (
              <InfoCard 
                icon={Sparkles} 
                title="TASKS ASSIGNED" 
                value={formatMaidTasks(booking)}
                accent={serviceConfig.accentColor}
              />
            )}
          </div>

          {/* Enhanced SLA Progress */}
          <SlaProgress booking={booking} pending={isPending} />

          {/* Worker assignment card with rich styling */}
          {isAssigned && booking.worker_name && (
            <div className="mt-6">
              <button 
                className="w-full group/worker rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 p-5 hover:from-emerald-100 hover:to-green-100 transition-all duration-300 text-left hover:shadow-lg"
                onClick={() => setSheetOpen(true)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-emerald-900 text-base">
                      {booking.worker_name}
                    </div>
                    <div className="text-sm text-emerald-700 font-medium">
                      Assigned Worker • Tap to reassign
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-emerald-600 group-hover/worker:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          )}

          {/* Enhanced action buttons */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              size="lg"
              className="rounded-2xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 font-bold h-14 transition-all hover:scale-[1.02] hover:shadow-lg"
              onClick={handleCancel}
              disabled={saving}
            >
              {saving ? (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
                  <span className="hidden sm:inline">Cancelling...</span>
                  <span className="sm:hidden">...</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5" />
                  <span className="hidden sm:inline">Cancel Booking</span>
                  <span className="sm:hidden">Cancel</span>
                </div>
              )}
            </Button>
            
            <Button
              size="lg"
              className={cn(
                "rounded-2xl font-bold h-14 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl bg-gradient-to-r",
                serviceConfig.gradient
              )}
              onClick={() => setSheetOpen(true)}
              disabled={saving}
            >
              <div className="flex items-center gap-3">
                <UserCheck className="h-5 w-5" />
                <span className="hidden sm:inline">
                  {isAssigned ? 'Reassign Worker' : 'Assign Worker'}
                </span>
                <span className="sm:hidden">
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