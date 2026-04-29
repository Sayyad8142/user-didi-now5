import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import { prettyServiceName } from '@/features/booking/utils';
import { formatDateTime } from '@/features/bookings/dt';
import { format } from 'date-fns';
import { formatWalletReason } from '@/hooks/useWallet';
import { PhoneCall, Sparkles, ChefHat, ShowerHead, Clock, MapPin, Timer, CreditCard, Star, MessageCircle, RefreshCw, Shield, Wallet, KeyRound, Calendar, Navigation, PlayCircle, Loader, CheckCircle, XCircle, ChevronRight, ArrowRight, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import AssigningProgress from '@/features/bookings/AssigningProgress';
import AutoCompleteCountdown from '@/components/AutoCompleteCountdown';
import { useBookingRealtime } from '@/features/bookings/useBookingRealtime';
import { PayWorkerManualSheet } from '@/components/PayWorkerManualSheet';
import { toast } from 'sonner';
import { executePaymentFlow, type PaymentFlowStatus } from '@/lib/paymentService';
import { useNow } from '@/hooks/useNow';
import CancelAction from './CancelAction';
import { RateWorker } from './RateWorker';
import { openExternalUrl } from '@/lib/nativeOpen';
import ChatSheet from '@/features/chat/ChatSheet';
import { LoadingWorkerBadge } from '@/components/LoadingWorkerBadge';
import { WorkerRatingsModal } from './WorkerRatingsModal';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { useProfile } from '@/contexts/ProfileContext';
import { WorkerReachConfirmationCard } from './WorkerReachConfirmationCard';
import { ReportIssueButton } from './ReportIssueSheet';
import {
  FindingWorkerCountdown,
  NoWorkerCancelledBlock,
  isNoWorkerCancellation,
  shouldShowDispatchCountdown,
} from './NoWorkerStateBlock';
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
  price_inr?: number | null;
  discount_inr?: number | null;
  discount_reason?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
  worker_phone?: string | null;
  worker_upi?: string | null;
  worker_photo_url?: string | null;
  auto_complete_at?: string | null;
  assigned_at?: string | null;
  pay_enabled_at?: string | null;
  cancel_source?: string | null;
  cancel_reason?: string | null;
  completion_otp?: string | null;
  otp_verified_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  wallet_refund_status?: string | null;
  wallet_refund_amount?: number | null;
  wallet_refund_reason?: string | null;
  reach_status?: string | null;
  reach_confirmed_at?: string | null;
}
interface BookingCardProps {
  booking: Booking;
}
const getServiceIcon = (serviceType: string) => {
  switch (serviceType) {
    case 'maid':
      return <Sparkles className="w-4 h-4" />;
    case 'cook':
      return <ChefHat className="w-4 h-4" />;
    case 'bathroom_cleaning':
      return <ShowerHead className="w-4 h-4" />;
    default:
      return <Sparkles className="w-4 h-4" />;
  }
};

// Premium status pill — matches ActiveBookingCard language
const getStatusPill = (status: string, bookingType: string): { label: string; className: string; icon: React.ReactNode } => {
  if (status === 'cancelled') {
    return { label: 'Cancelled', className: 'bg-muted text-muted-foreground ring-1 ring-border', icon: <XCircle className="w-3 h-3" /> };
  }
  if (status === 'completed') {
    return { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: <CheckCircle className="w-3 h-3" /> };
  }
  if (status === 'pending') {
    if (bookingType === 'scheduled') {
      return { label: 'Scheduled', className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', icon: <Calendar className="w-3 h-3" /> };
    }
    return { label: 'Finding worker', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon: <Loader className="w-3 h-3 animate-spin" /> };
  }
  if (status === 'assigned' || status === 'accepted') {
    return { label: 'Assigned', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: <CheckCircle className="w-3 h-3" /> };
  }
  if (status === 'on_the_way') {
    return { label: 'On the way', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: <Navigation className="w-3 h-3" /> };
  }
  if (status === 'started') {
    return { label: 'In progress', className: 'bg-primary/10 text-primary ring-1 ring-primary/20', icon: <PlayCircle className="w-3 h-3" /> };
  }
  return { label: status, className: 'bg-muted text-muted-foreground ring-1 ring-border', icon: <MapPin className="w-3 h-3" /> };
};
export function BookingCard({
  booking
}: BookingCardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  
  const [assignedWorker, setAssignedWorker] = useState<any>(null);
  const [loadingWorker, setLoadingWorker] = useState(true);
  const [row, setRow] = useState(booking);
  const [workerStats, setWorkerStats] = useState<{ avg_rating: number; ratings_count: number } | null>(null);
  const [openChat, setOpenChat] = useState(false);
  const [showWorkerRatings, setShowWorkerRatings] = useState(false);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [showChangeWorkerSheet, setShowChangeWorkerSheet] = useState(false);
  const [changeWorkerLoading, setChangeWorkerLoading] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [workerPaymentInfo, setWorkerPaymentInfo] = useState<{
    upi_id: string | null;
    upi_qr_payload: string | null;
    upi_qr_url: string | null;
    full_name: string | null;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [retryingPayment, setRetryingPayment] = useState(false);
  const now = useNow(); // ticks every 30s
  
  // Subscribe to real-time updates for this specific booking
  useBookingRealtime(booking.id, (updatedBooking) => setRow(updatedBooking));
  
  const effectiveWorkerId = row.worker_id || assignedWorker?.worker?.id || null;

  // Load worker rating stats
  useEffect(() => {
    if (!effectiveWorkerId) {
      setWorkerStats(null);
      return;
    }

    supabase
      .from('worker_rating_stats')
      .select('avg_rating, ratings_count')
      .eq('worker_id', effectiveWorkerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[worker_rating_stats] load error', error);
        setWorkerStats(data ?? null);
      });
  }, [effectiveWorkerId]);

  // Load worker payment info (QR data)
  useEffect(() => {
    if (!effectiveWorkerId) {
      setWorkerPaymentInfo(null);
      return;
    }

    supabase
      .from('workers')
      .select('upi_id, upi_qr_payload, upi_qr_url, full_name')
      .eq('id', effectiveWorkerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[workers] payment info load error', error);
        setWorkerPaymentInfo(data ?? null);
      });
  }, [effectiveWorkerId]);

  // Load payment status
  useEffect(() => {
    supabase
      .from('bookings')
      .select('payment_status')
      .eq('id', booking.id)
      .maybeSingle()
      .then(({ data }) => {
        setPaymentStatus(data?.payment_status || 'pending');
      });
  }, [booking.id]);

  // Load assigned worker (for fallback compatibility)
  useEffect(() => {
    let active = true;
    
    const loadAssignedWorker = async () => {
      try {
        const { data, error } = await supabase
          .from("assignments")
          .select(`
            id,
            status,
            created_at,
            worker:workers(id, full_name, phone, upi_id, photo_url)
          `)
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: false })
          .limit(1);
          
        if (!active) return;
        
        if (error) {
          console.error("Error loading assigned worker:", error);
          return;
        }
        
        setAssignedWorker(data?.[0] ?? null);
      } catch (err) {
        console.error("Error in loadAssignedWorker:", err);
      } finally {
        if (active) setLoadingWorker(false);
      }
    };
    
    loadAssignedWorker();
    
    return () => {
      active = false;
    };
  }, [booking.id]);
  
  // Track assignment count (to limit worker change to 1)
  useEffect(() => {
    supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', booking.id)
      .then(({ count }) => {
        setAssignmentCount(count ?? 0);
      });
  }, [booking.id, row.worker_id]);

  const workerChangeUsed = assignmentCount >= 2;

  const handleChangeWorker = async () => {
    setChangeWorkerLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reassign-worker', {
        body: { booking_id: row.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.warning || 'Looking for another worker…');
      setShowChangeWorkerSheet(false);
    } catch (err: any) {
      console.error('Change worker error:', err);
      toast.error(err?.message || 'Could not change worker. Try again.');
    } finally {
      setChangeWorkerLoading(false);
    }
  };

  const title = prettyServiceName(booking.service_type);
  
  // Build a single short info line — sharp & concise (matches ActiveBookingCard)
  const getInfoLine = (): string | null => {
    if (row.status === 'cancelled') return 'Booking cancelled';
    if (row.status === 'completed') return 'Service completed successfully';
    if (booking.booking_type === 'scheduled' && booking.scheduled_date && booking.scheduled_time) {
      const today = new Date(); today.setHours(0,0,0,0);
      const sched = new Date(`${booking.scheduled_date}T${booking.scheduled_time.slice(0,5)}:00`);
      const sameDay = sched.toDateString() === today.toDateString();
      const time = sched.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
      if (sameDay) return `Today at ${time}`;
      const dayLabel = sched.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      return `${dayLabel} · ${time}`;
    }
    if (row.status === 'on_the_way') return 'Worker is on the way';
    if (row.status === 'started') return 'Service in progress';
    if (row.status === 'assigned' || row.status === 'accepted') return 'Worker will arrive soon';
    if (row.status === 'pending') return 'Finding a worker near you';
    return format(new Date(booking.created_at), 'dd MMM, hh:mm a');
  };

  // Check if payment should be enabled (show for assigned/accepted/on_the_way/started)
  const paymentReady = ['assigned', 'accepted', 'on_the_way', 'started'].includes(row.status);

  // QR payment details
  const upiId = workerPaymentInfo?.upi_id || undefined;
  const qrImageUrl = workerPaymentInfo?.upi_qr_url || undefined;
  const hasPaymentInfo = !!upiId || !!qrImageUrl;

  const handlePayWorker = () => {
    setShowPaySheet(true);
  };

  const handleSubmitRating = async (rating: number, comment?: string) => {
    if (!profile?.id) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('worker_ratings')
      .upsert(
        {
          booking_id: row.id,
          worker_id: row.worker_id,
          user_id: profile.id,
          rating,
          comment: comment ?? null,
        },
        { onConflict: 'booking_id' }
      );

    if (error) throw error;
  };

  const handleRetryPayment = async () => {
    if (retryingPayment) return;
    setRetryingPayment(true);
    try {
      await executePaymentFlow(row.id, () => {});
      toast.success('Payment successful! Your booking is confirmed.');
    } catch (err: any) {
      if (err.message !== 'Payment cancelled by user') {
        toast.error(err.message || 'Payment failed. Please try again.');
      }
      // Mark as failed so UI updates correctly
      await supabase.from('bookings').update({ payment_status: 'failed' }).eq('id', row.id);
    } finally {
      setRetryingPayment(false);
    }
  };

  const avgRating = workerStats?.avg_rating ?? 0;
  const ratingsCount = workerStats?.ratings_count ?? 0;
  const stars = Math.round(avgRating);

  const pill = getStatusPill(row.status, booking.booking_type);
  const infoLine = getInfoLine();
  const isCancelled = row.status === 'cancelled';
  const isCompleted = row.status === 'completed';
  const isPendingInstant = row.status === 'pending' && booking.booking_type !== 'scheduled';
  const workerDisplayName = assignedWorker?.worker?.full_name || row.worker_name;
  const workerPhotoUrl = assignedWorker?.worker?.photo_url || row.worker_photo_url;
  // OTP shown when booking is fully paid (wallet, razorpay, wallet+razorpay) or pay-after-service.
  const _isPaidLike =
    row.payment_status === 'paid' ||
    row.payment_status === 'pay_after_service' ||
    row.payment_method === 'wallet' ||
    row.payment_method === 'wallet+razorpay' ||
    row.payment_method === 'razorpay';
  // OTP visible from booking creation. Hidden only when cancelled,
  // or completed AND already verified.
  const _otpHidden =
    row.status === 'cancelled' ||
    (row.status === 'completed' && !!row.otp_verified_at);
  const showOtpBlock = !!row.completion_otp &&
    _isPaidLike &&
    !row.otp_verified_at &&
    !_otpHidden;
  const _paymentMethod = (row as any).payment_method as string | undefined;
  const _isWalletPaid = _paymentMethod === 'wallet' || _paymentMethod === 'wallet+razorpay';
  const _isPaid = row.payment_status === 'paid' || row.payment_status === 'pay_after_service' || _isWalletPaid;
  const needsPaymentRetry =
    !_isPaid &&
    (row.payment_status === 'unpaid' || row.payment_status === 'failed' || row.payment_status === 'order_created' || row.payment_status === 'pending') &&
    !isCancelled && !isCompleted;

  return (
    <>

    <Card
      className={`relative overflow-hidden p-5 rounded-3xl animate-fade-in transition-all ${
        isCancelled
          ? 'bg-card border border-border/60 shadow-sm opacity-95'
          : isCompleted
            ? 'bg-card border border-emerald-200/60 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.15)]'
            : 'bg-card border border-primary/15 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)]'
      }`}
    >
      {/* Accent stripe + soft glow — muted for cancelled/completed */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1 ${
          isCancelled ? 'bg-muted-foreground/20' : isCompleted ? 'bg-gradient-to-b from-emerald-500 to-emerald-300' : 'bg-gradient-to-b from-primary to-primary/40'
        }`}
      />
      {!isCancelled && (
        <span aria-hidden className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      )}

      {/* A. TOP — service icon + title + status pill */}
      <div className="relative flex items-start justify-between gap-3 pl-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-2xl shrink-0 ring-1 ${
            isCancelled
              ? 'bg-muted text-muted-foreground ring-border'
              : 'bg-primary/10 text-primary ring-primary/10'
          }`}>
            {getServiceIcon(booking.service_type)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight text-foreground tracking-tight truncate">
              {title}
            </h3>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              {booking.booking_type === 'instant' ? 'Instant' : 'Scheduled'} · {format(new Date(booking.created_at), 'dd MMM')}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors shrink-0 ${pill.className}`}>
          {pill.icon}
          <span>{pill.label}</span>
        </span>
      </div>

      {/* B. INFO LINE — primary date/time/status sentence */}
      {infoLine && (
        <div className="mt-3 pl-1">
          <p key={infoLine} className="text-[15px] font-semibold text-foreground tracking-tight animate-fade-in">
            {infoLine}
          </p>
        </div>
      )}

      {/* Location — muted, secondary, very compact */}
      <div className="mt-1.5 pl-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
        <MapPin className="w-3 h-3 shrink-0 opacity-70" />
        <span className="truncate">{booking.community} · Flat {booking.flat_no}</span>
      </div>

      {/* Pending — slim progress (priority block #1: status) */}
      {row.status === 'pending' && (
        <div className="mt-3 pl-1">
          <AssigningProgress booking={row} />
        </div>
      )}

      {/* Worker mini-card (priority block #2: worker) */}
      {workerDisplayName && !isCancelled && !isCompleted && (
        <div className="mt-4 ml-1 mr-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 pl-0.5">
            Assigned worker
          </p>
          <button
            type="button"
            onClick={() => stars > 0 && setShowWorkerRatings(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/10 transition-colors text-left animate-fade-in"
          >
            <WorkerAvatar photoUrl={workerPhotoUrl} name={workerDisplayName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-foreground truncate">{workerDisplayName}</p>
              {stars > 0 ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
                  <span className="text-[11px] text-muted-foreground">
                    {avgRating.toFixed(1)} · {ratingsCount} ratings
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-0.5">Your assigned worker</p>
              )}
            </div>
            {stars > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
        </div>
      )}

      {/* Worker reach confirmation — visible only for active eligible bookings (15-min gate) */}
      {!isCancelled && !isCompleted && (
        <div className="mt-3 ml-1 mr-1">
          <WorkerReachConfirmationCard booking={row} />
        </div>
      )}

      {/* Payment retry (priority block #3: payment issue) — focused, single CTA */}
      {needsPaymentRetry && (
        <div className="mt-3 ml-1 mr-1 px-3 py-3 rounded-xl bg-amber-50 ring-1 ring-amber-200">
          <p className="text-[12px] font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            {row.payment_status === 'failed' ? 'Payment failed — tap to retry' : 'Payment pending'}
          </p>
          <Button
            onClick={handleRetryPayment}
            disabled={retryingPayment}
            className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] shadow-sm"
          >
            {retryingPayment ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing…</>
            ) : (
              <>{row.payment_status === 'failed' ? 'Retry Payment' : 'Complete Payment'} · ₹{row.price_inr || 0}</>
            )}
          </Button>
        </div>
      )}

      {/* C. BOTTOM — price + primary CTA */}
      <div className="mt-5 ml-1 mr-1 flex items-center gap-2.5">
        {/* Price chip on the left for active/completed bookings */}
        {row.price_inr != null && !isCancelled && (
          <div className="flex flex-col leading-none shrink-0">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total</span>
            <span className="text-[16px] font-bold text-foreground mt-0.5">₹{row.price_inr}</span>
          </div>
        )}

        {/* Primary CTA — varies by state */}
        {isCancelled ? (
          <Button
            onClick={() => navigate('/')}
            className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[14px] shadow-md shadow-primary/25"
          >
            Book Again <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : isCompleted ? (
          <Button
            onClick={() => navigate('/')}
            className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[14px] shadow-md shadow-primary/25"
          >
            Rebook <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <>
            <Button
              onClick={() => navigate(`/booking/${row.id}`)}
              className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[14px] tracking-tight shadow-md shadow-primary/25"
            >
              {(row.status === 'on_the_way' || row.status === 'started') ? 'Track Booking' : 'View Details'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => openExternalUrl('tel:+918008180018')}
              aria-label="Call Support"
              className="h-11 w-11 p-0 rounded-2xl border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <PhoneCall className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Contextual action chip — single quick action per state */}
      {(() => {
        // Priority: payment issue > status-based action
        if (needsPaymentRetry) {
          // Pay Now chip is redundant — full retry block already shown above
          return null;
        }
        if (row.status === 'pending') {
          return (
            <div className="mt-3 ml-1 mr-1 flex justify-end animate-fade-in">
              <CancelAction booking={row} onCancel={() => {}} />
            </div>
          );
        }
        if ((row.status === 'assigned' || row.status === 'accepted' || row.status === 'on_the_way') && row.worker_phone) {
          return (
            <div className="mt-3 ml-1 mr-1 flex justify-end animate-fade-in">
              <button
                type="button"
                onClick={() => openExternalUrl(`tel:${row.worker_phone}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-1 ring-border text-[12px] font-medium transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                Call Worker
              </button>
            </div>
          );
        }
        if (isCompleted) {
          return (
            <div className="mt-3 ml-1 mr-1 flex justify-end animate-fade-in">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-1 ring-border text-[12px] font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rebook
              </button>
            </div>
          );
        }
        return null;
      })()}

      {/* Report Issue — only for active bookings with a worker assigned */}
      {!isCancelled && !isCompleted && row.worker_id && (
        <div className="mt-3 ml-1 mr-1 flex justify-end">
          <ReportIssueButton
            bookingId={row.id}
            workerId={row.worker_id}
            status={row.status}
            hasWorker={!!row.worker_id}
          />
        </div>
      )}
    </Card>

    <ChatSheet open={openChat} onOpenChange={setOpenChat} booking={row} mode="user" />

    {/* Pay Worker Manual Sheet */}
    <PayWorkerManualSheet
      open={showPaySheet}
      onOpenChange={setShowPaySheet}
      bookingId={row.id}
      workerName={row.worker_name || assignedWorker?.worker?.full_name || workerPaymentInfo?.full_name || undefined}
      amount={row.price_inr ?? undefined}
      upiId={upiId}
      qrImageUrl={qrImageUrl}
      paymentStatus={paymentStatus}
    />

    {/* Worker Ratings Modal */}
    {row.worker_id && row.worker_name && (
      <WorkerRatingsModal
        open={showWorkerRatings}
        onOpenChange={setShowWorkerRatings}
        workerId={row.worker_id}
        workerName={row.worker_name}
      />
    )}

    {/* Change Worker Confirmation Sheet */}
    <Sheet open={showChangeWorkerSheet} onOpenChange={setShowChangeWorkerSheet}>
      <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle>Change Worker?</SheetTitle>
          <SheetDescription>
            We'll try to assign another available worker. Current worker will be notified.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowChangeWorkerSheet(false)}
            disabled={changeWorkerLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleChangeWorker}
            disabled={changeWorkerLoading}
          >
            {changeWorkerLoading ? 'Reassigning…' : 'Confirm'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}