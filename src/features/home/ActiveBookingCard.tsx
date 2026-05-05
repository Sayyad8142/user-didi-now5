import React, { useEffect, useState, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ChefHat, ShowerHead, ArrowRight, X, PhoneCall, Star, CheckCircle, XCircle, KeyRound, Loader2, ChevronRight, Calendar, Navigation, PlayCircle, Loader, MapPin } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useProfile } from '@/contexts/ProfileContext';
import { prettyServiceName } from '@/features/booking/utils';
import AssigningProgress from '@/features/bookings/AssigningProgress';
import { PayWorkerManualSheet } from '@/components/PayWorkerManualSheet';
import { toast } from 'sonner';
import { RateWorker } from '@/features/bookings/RateWorker';
import { openExternalUrl } from '@/lib/nativeOpen';
import ChatSheet from '@/features/chat/ChatSheet';
import { LoadingWorkerBadge } from '@/components/LoadingWorkerBadge';
import { WorkerRatingsModal } from '@/features/bookings/WorkerRatingsModal';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { WorkerReachConfirmationCard } from '@/features/bookings/WorkerReachConfirmationCard';
import { ReportIssueButton } from '@/features/bookings/ReportIssueSheet';
import {
  FindingWorkerCountdown,
  NoWorkerCancelledBlock,
  isNoWorkerCancellation,
  shouldShowDispatchCountdown,
} from '@/features/bookings/NoWorkerStateBlock';

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
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  reach_status?: string | null;
  reach_confirmed_at?: string | null;
  reach_confirmed_by?: string | null;
  completion_otp?: string | null;
  otp_verified_at?: string | null;
  payment_status?: string | null;
  dispatch_expires_at?: string | null;
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

// Premium status pill — soft pastel, with icon and live animation when relevant
const getStatusPill = (booking: Booking): { label: string; className: string; icon: React.ReactNode } => {
  const { status, booking_type } = booking;
  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
      icon: <XCircle className="w-3 h-3" />,
    };
  }
  if (status === 'pending') {
    if (booking_type === 'scheduled') {
      return {
        label: 'Scheduled',
        className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
        icon: <Calendar className="w-3 h-3" />,
      };
    }
    return {
      label: 'Finding worker',
      className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
      icon: <Loader className="w-3 h-3 animate-spin" />,
    };
  }
  if (status === 'assigned' || status === 'accepted') {
    return {
      label: 'Assigned',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
      icon: <CheckCircle className="w-3 h-3" />,
    };
  }
  if (status === 'on_the_way') {
    return {
      label: 'On the way',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
      icon: <Navigation className="w-3 h-3" />,
    };
  }
  if (status === 'started') {
    return {
      label: 'In progress',
      className: 'bg-primary/10 text-primary ring-1 ring-primary/20',
      icon: <PlayCircle className="w-3 h-3" />,
    };
  }
  return {
    label: status,
    className: 'bg-muted text-muted-foreground ring-1 ring-border',
    icon: <MapPin className="w-3 h-3" />,
  };
};

// Build a single short info line — sharp & concise
const getInfoLine = (booking: Booking): string | null => {
  if (booking.status === 'cancelled') return null;

  if (booking.booking_type === 'scheduled' && booking.scheduled_date && booking.scheduled_time) {
    const today = new Date(); today.setHours(0,0,0,0);
    const sched = new Date(`${booking.scheduled_date}T${booking.scheduled_time.slice(0,5)}:00`);
    const sameDay = sched.toDateString() === today.toDateString();
    const time = sched.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (sameDay) return `Today at ${time}`;
    const dayLabel = sched.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dayLabel} · ${time}`;
  }

  if (booking.status === 'on_the_way') return 'Worker is on the way';
  if (booking.status === 'started') return 'Service in progress';
  if (booking.status === 'assigned' || booking.status === 'accepted') return 'Worker will arrive soon';
  if (booking.status === 'pending') return 'Finding a worker near you';
  return null;
};

// Helpful microcopy — short & sharp
const getHelperLine = (booking: Booking): string | null => {
  if (booking.status === 'cancelled') return null;
  if (booking.booking_type === 'scheduled' && booking.status === 'pending') {
    return "We'll assign your expert about 10 minutes before your scheduled time.";
  }
  if (booking.status === 'pending') {
    return "We'll notify you the moment a worker accepts";
  }
  if (booking.status === 'assigned' || booking.status === 'accepted' || booking.status === 'on_the_way' || booking.status === 'started') {
    return 'Share OTP only after work is fully completed';
  }
  return null;
};

// Check if reach confirmation buttons should be shown
const shouldShowReachButtons = (booking: Booking): boolean => {
  const activeStatuses = ['assigned', 'dispatched', 'on_the_way', 'accepted', 'started'];
  if (!activeStatuses.includes(booking.status)) return false;
  if (booking.reach_status && booking.reach_status !== 'pending') return false;

  const now = Date.now();
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  let referenceTime: number;

  if (booking.booking_type === 'scheduled' && booking.scheduled_date) {
    const timeStr = booking.scheduled_time ? booking.scheduled_time.slice(0, 5) : '00:00';
    const scheduledDateTime = new Date(`${booking.scheduled_date}T${timeStr}:00`);
    referenceTime = scheduledDateTime.getTime();
    if (isNaN(referenceTime)) referenceTime = new Date(booking.created_at).getTime();
  } else {
    referenceTime = new Date(booking.created_at).getTime();
  }
  return now >= referenceTime + FIFTEEN_MINUTES;
};

const ActiveBookingCard = memo(() => {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedBookings, setDismissedBookings] = useState<Set<string>>(new Set());
  const [openChat, setOpenChat] = useState(false);
  const [workerStats, setWorkerStats] = useState<{ avg_rating: number; ratings_count: number } | null>(null);
  const [showWorkerRatings, setShowWorkerRatings] = useState(false);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [showOtpSheet, setShowOtpSheet] = useState(false);
  const [reachButtonsVisible, setReachButtonsVisible] = useState(false);
  const [updatingReachStatus, setUpdatingReachStatus] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [workerPaymentInfo, setWorkerPaymentInfo] = useState<{
    upi_id: string | null;
    upi_qr_payload: string | null;
    upi_qr_url: string | null;
    full_name: string | null;
  } | null>(null);
  const [showChangeWorkerSheet, setShowChangeWorkerSheet] = useState(false);
  const [changeWorkerLoading, setChangeWorkerLoading] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState(0);

  const fetchActiveBooking = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayStart = startOfToday.toISOString();

      const { data: allBookings, error } = await supabase
        .from('bookings')
        .select('*, workers:workers!bookings_worker_id_fkey(upi_id)')
        .eq('user_id', profile.id)
        .or(`and(status.in.(pending,assigned,accepted,on_the_way,started),booking_type.eq.instant),and(status.in.(pending,assigned,accepted,on_the_way,started),booking_type.eq.scheduled,scheduled_date.gte.${today}),and(status.eq.cancelled,cancelled_at.gte.${todayStart})`)
        .order('created_at', { ascending: false });

      let bookingToShow = null;
      if (allBookings && allBookings.length > 0) {
        const activeBooking = allBookings.find(b => b.status !== 'cancelled' && !dismissedBookings.has(b.id));
        const cancelledBooking = allBookings.find(b => b.status === 'cancelled' && !dismissedBookings.has(b.id));
        const rawBooking = activeBooking || cancelledBooking;
        if (rawBooking) {
          const workerData = rawBooking.workers as { upi_id: string | null } | null;
          bookingToShow = {
            ...rawBooking,
            worker_upi: rawBooking.worker_upi || workerData?.upi_id || null,
            workers: undefined,
          };
        }
      }
      if (error) console.error('Error fetching active booking:', error);
      else setActiveBooking(bookingToShow || null);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedBookings');
    if (dismissed) setDismissedBookings(new Set(JSON.parse(dismissed)));
  }, []);

  useEffect(() => {
    if (profile?.id) fetchActiveBooking();
    else { setLoading(false); setActiveBooking(null); }
  }, [profile?.id]);

  useEffect(() => {
    if (!activeBooking?.worker_id) { setWorkerStats(null); return; }
    supabase.from('worker_rating_stats').select('avg_rating, ratings_count')
      .eq('worker_id', activeBooking.worker_id).maybeSingle()
      .then(({ data }) => setWorkerStats(data ?? null));
  }, [activeBooking?.worker_id]);

  useEffect(() => {
    if (!activeBooking?.worker_id) { setWorkerPaymentInfo(null); return; }
    supabase.from('workers').select('upi_id, upi_qr_payload, upi_qr_url, full_name')
      .eq('id', activeBooking.worker_id).maybeSingle()
      .then(({ data }) => setWorkerPaymentInfo(data ?? null));
  }, [activeBooking?.worker_id]);

  useEffect(() => {
    if (!activeBooking?.id) return;
    supabase.from('bookings').select('payment_status').eq('id', activeBooking.id).maybeSingle()
      .then(({ data }) => setPaymentStatus(data?.payment_status || 'pending'));
  }, [activeBooking?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`active-booking-updates-${profile.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `user_id=eq.${profile.id}` },
        () => fetchActiveBooking()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, fetchActiveBooking]);

  useEffect(() => {
    if (!activeBooking) { setReachButtonsVisible(false); return; }
    const checkVisibility = () => setReachButtonsVisible(shouldShowReachButtons(activeBooking));
    checkVisibility();
    const interval = setInterval(checkVisibility, 30000);
    return () => clearInterval(interval);
  }, [activeBooking]);

  useEffect(() => {
    if (!activeBooking?.id) return;
    supabase.from('assignments').select('id', { count: 'exact', head: true })
      .eq('booking_id', activeBooking.id)
      .then(({ count }) => setAssignmentCount(count ?? 0));
  }, [activeBooking?.id, activeBooking?.worker_id]);

  // Rotating "Finding worker" copy — cycles every 3.5s while pending instant
  const findingMessages = useMemo(() => [
    'Finding a worker near you',
    'Trying nearby workers',
    'Assigning shortly',
  ], []);
  const [findingIdx, setFindingIdx] = useState(0);
  const isFindingActive = activeBooking?.status === 'pending' && activeBooking?.booking_type !== 'scheduled';
  useEffect(() => {
    if (!isFindingActive) { setFindingIdx(0); return; }
    const id = setInterval(() => setFindingIdx(i => (i + 1) % findingMessages.length), 3500);
    return () => clearInterval(id);
  }, [isFindingActive, findingMessages.length]);

  // Auto-close OTP sheet if the OTP row becomes unavailable (status change, verified, etc.)
  // OTP shows for ANY active booking with a completion_otp — no payment gating.
  // Hidden only when cancelled, or completed AND already verified.
  useEffect(() => {
    const status = activeBooking?.status ?? '';
    const isHiddenState =
      status === 'cancelled' ||
      (status === 'completed' && !!activeBooking?.otp_verified_at);
    const shouldShow =
      !!activeBooking?.completion_otp &&
      !activeBooking?.otp_verified_at &&
      !isHiddenState;
    if (!shouldShow && showOtpSheet) setShowOtpSheet(false);
  }, [activeBooking?.completion_otp, activeBooking?.otp_verified_at, activeBooking?.status, showOtpSheet]);

  const workerChangeUsed = assignmentCount >= 2;

  if (loading || !activeBooking) return null;

  const handleChangeWorker = async () => {
    setChangeWorkerLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reassign-worker', { body: { booking_id: activeBooking.id } });
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

  const handleViewDetails = () => navigate('/bookings');

  const handleDismiss = () => {
    const newDismissed = new Set(dismissedBookings);
    newDismissed.add(activeBooking.id);
    setDismissedBookings(newDismissed);
    localStorage.setItem('dismissedBookings', JSON.stringify([...newDismissed]));
    setActiveBooking(null);
  };

  const isAssigned = activeBooking.status === 'assigned';
  const upiId = workerPaymentInfo?.upi_id || undefined;
  const qrImageUrl = workerPaymentInfo?.upi_qr_url || undefined;

  const handleSubmitRating = async (rating: number, comment?: string) => {
    if (!profile?.id) throw new Error('Not authenticated');
    const { error } = await supabase.from('worker_ratings').upsert(
      { booking_id: activeBooking.id, worker_id: activeBooking.worker_id, user_id: profile.id, rating, comment: comment ?? null },
      { onConflict: 'booking_id' }
    );
    if (error) throw error;
  };

  const handleReachConfirmation = async (reached: boolean) => {
    if (updatingReachStatus) return;
    if (activeBooking.reach_status && activeBooking.reach_status !== 'pending') return;
    setUpdatingReachStatus(true);

    const newStatus = reached ? 'reached' : 'not_reached';
    const nowIso = new Date().toISOString();

    // Optimistic UI update first
    const previousReachStatus = activeBooking.reach_status;
    setActiveBooking(prev => prev ? { ...prev, reach_status: newStatus, reach_confirmed_at: nowIso } : null);
    setReachButtonsVisible(false);

    try {
      // PRIMARY: try edge function (sends admin alerts on 'not_reached')
      let edgeOk = false;
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        const { data, error } = await supabase.functions.invoke('confirm-worker-reach', {
          body: { booking_id: activeBooking.id, reached },
          headers: token ? { 'x-firebase-token': token } : undefined,
        });
        if (!error && !data?.error) edgeOk = true;
        else console.warn('[ReachStatus] Edge function unavailable, using direct DB fallback:', error || data?.error);
      } catch (edgeErr) {
        console.warn('[ReachStatus] Edge function call failed, falling back to direct update:', edgeErr);
      }

      // FALLBACK: direct DB update (works when edge fn is 404 / network unreachable)
      if (!edgeOk) {
        const { error: dbErr } = await supabase
          .from('bookings')
          .update({
            reach_status: newStatus,
            reach_confirmed_at: nowIso,
            reach_confirmed_by: 'user',
          })
          .eq('id', activeBooking.id)
          .eq('user_id', profile?.id ?? '');
        if (dbErr) throw dbErr;
        console.log('[ReachStatus] ✅ Direct DB update succeeded');
      }

      if (reached) toast.success('Thanks for confirming. Worker has reached.');
      else toast.info('Thanks. Our team will take action immediately.');
      fetchActiveBooking();
    } catch (error: any) {
      console.error('[ReachStatus] All update paths failed:', error);
      // Roll back optimistic update
      setActiveBooking(prev => prev ? { ...prev, reach_status: previousReachStatus ?? 'pending', reach_confirmed_at: null } : null);
      setReachButtonsVisible(true);
      toast.error('Could not update status. Please try again.');
    } finally {
      setUpdatingReachStatus(false);
    }
  };

  const pill = getStatusPill(activeBooking);
  const infoLine = getInfoLine(activeBooking);
  const helperLine = getHelperLine(activeBooking);
  // OTP visible for any active booking that has a completion_otp generated.
  // Hidden only when cancelled, or completed+verified.
  const _otpHiddenState =
    activeBooking.status === 'cancelled' ||
    (activeBooking.status === 'completed' && !!activeBooking.otp_verified_at);
  const showOtpRow =
    !!activeBooking.completion_otp &&
    !activeBooking.otp_verified_at &&
    !_otpHiddenState;
  const isCancelled = activeBooking.status === 'cancelled';
  const isFinding = activeBooking.status === 'pending' && activeBooking.booking_type !== 'scheduled';

  return (
    <>
      {/* Worker reach confirmation — shared component (handles eligibility, confirmed banners, edge fn + history logging) */}
      <WorkerReachConfirmationCard
        booking={activeBooking}
        onConfirmed={() => fetchActiveBooking()}
      />


      {/* MAIN CARD — premium, animated entry */}
      <Card className="relative overflow-hidden p-5 bg-card border border-primary/15 rounded-3xl shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)] animate-fade-in">
        {/* Subtle accent stripe */}
        <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-primary/40" />
        {/* Soft top-right glow */}
        <span aria-hidden className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

        {/* A. Top row — service + price + status pill + dismiss */}
        <div className="relative flex items-start justify-between gap-3 pl-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0 ring-1 ring-primary/10">
              {getServiceIcon(activeBooking.service_type)}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight text-foreground tracking-tight truncate">
                {prettyServiceName(activeBooking.service_type)}
              </h3>
              {activeBooking.price_inr != null && !isCancelled && (
                <p className="text-xs font-medium text-muted-foreground mt-0.5">₹{activeBooking.price_inr}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors ${pill.className} ${isFindingActive ? 'animate-soft-pulse' : ''}`}>
              {pill.icon}
              <span>{pill.label}</span>
            </span>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* B. Info line — rotating shimmer text for "Finding worker", static otherwise */}
        {infoLine && (
          <div className="mt-3 pl-1 flex items-center gap-2 min-h-[22px]">
            {isFindingActive ? (
              <p
                key={findingIdx}
                className="text-[15px] font-semibold tracking-tight bg-clip-text text-transparent bg-[linear-gradient(110deg,hsl(var(--foreground))_30%,hsl(var(--primary))_50%,hsl(var(--foreground))_70%)] bg-[length:200%_100%] animate-shimmer animate-fade-in"
              >
                {findingMessages[findingIdx]}…
              </p>
            ) : (
              <p key={infoLine} className="text-[15px] font-semibold text-foreground tracking-tight animate-fade-in">
                {infoLine}
              </p>
            )}
            {isFindingActive && (
              <span className="inline-flex gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
        )}

        {/* Pending — slim progress with very subtle shimmer */}
        {activeBooking.status === 'pending' && !isCancelled && (
          <div className="pl-1 relative">
            <AssigningProgress booking={activeBooking} />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 bottom-0 h-2 rounded-full overflow-hidden opacity-40"
            >
              <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_40%,hsl(var(--primary)/0.18)_50%,transparent_60%)] bg-[length:200%_100%] animate-shimmer" />
            </span>
          </div>
        )}

        {/* Auto-cancel countdown when no worker has been assigned yet */}
        {shouldShowDispatchCountdown(activeBooking) && (
          <FindingWorkerCountdown booking={activeBooking} />
        )}

        {/* Reassurance line — only for pending instant */}
        {isFindingActive && (
          <p className="mt-2 pl-1 text-xs text-muted-foreground animate-fade-in">
            We're actively finding the best worker for you
          </p>
        )}

        {/* C. Helper microcopy — tertiary (skip for finding state to avoid duplication) */}
        {helperLine && !isFindingActive && (
          <p key={helperLine} className="mt-2 pl-1 text-xs text-muted-foreground animate-fade-in">{helperLine}</p>
        )}

        {/* Worker mini-card — labeled, tinted, feels like a card-in-card */}
        {activeBooking.worker_name && !isCancelled && (
          <div className="mt-4 ml-1 mr-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 pl-0.5">
              Assigned worker
            </p>
            <button
              type="button"
              onClick={() => workerStats && setShowWorkerRatings(true)}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/10 transition-colors text-left animate-fade-in"
            >
              <WorkerAvatar
                photoUrl={activeBooking.worker_photo_url}
                name={activeBooking.worker_name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate">{activeBooking.worker_name}</p>
              {workerStats && workerStats.avg_rating > 0 ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
                  <span className="text-[11px] text-muted-foreground">
                    {workerStats.avg_rating.toFixed(1)} · {workerStats.ratings_count} ratings
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-0.5">Your assigned worker</p>
              )}
              </div>
              {workerStats && workerStats.avg_rating > 0 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          </div>
        )}

        {/* OTP block moved to HomeOtpCard (rendered above this card on Home) */}

        {/* Rate worker prompt — keep when assigned/completed */}
        {(activeBooking.status === 'assigned' || activeBooking.status === 'completed') && activeBooking.worker_id && (
          <div className="mt-3 ml-1">
            <RateWorker
              bookingId={activeBooking.id}
              workerId={activeBooking.worker_id}
              onSubmit={handleSubmitRating}
            />
          </div>
        )}

        {/* Cancellation message */}
        {isCancelled && (
          isNoWorkerCancellation(activeBooking) ? (
            <NoWorkerCancelledBlock booking={activeBooking} />
          ) : (
            <div className="mt-3 ml-1 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              {activeBooking.cancel_source === 'user' ? (
                <p className="text-rose-800 text-sm">Booking cancelled by you. You can book again anytime.</p>
              ) : activeBooking.cancel_source === 'admin' ? (
                <p className="text-rose-800 text-sm">Cancelled by admin — we couldn't provide a helper this time.</p>
              ) : (
                <p className="text-rose-800 text-sm">All workers are busy. Please try again in a few minutes.</p>
              )}
            </div>
          )
        )}

        {/* D. Bottom CTAs — hide Call Manager when no-worker block is shown (it has Book Again) */}
        {!(isCancelled && isNoWorkerCancellation(activeBooking)) && (
          <div className="mt-6 ml-1 flex items-center gap-2.5">
            {isCancelled ? (
              <Button
                onClick={() => openExternalUrl('tel:+918008180018')}
                className="flex-1 h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[15px] shadow-md shadow-primary/25"
              >
                <PhoneCall className="h-4 w-4 mr-2" /> Call Manager
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleViewDetails}
                  className="flex-1 h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[15px] tracking-tight shadow-md shadow-primary/25"
                >
                  Track Booking
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openExternalUrl('tel:+918008180018')}
                  aria-label="Call Manager"
                  className="h-12 px-3 rounded-2xl border-primary/20 text-primary hover:bg-primary/5 shrink-0 font-semibold text-[13px] gap-1.5"
                >
                  <PhoneCall className="h-4 w-4" />
                  Call Manager
                </Button>
              </>
            )}
          </div>
        )}

        {/* Hidden: Change worker action — kept reachable via Bookings details for less clutter.
            Quietly preserved when worker assigned and not yet exhausted. */}
        {activeBooking.worker_name && ['assigned', 'accepted', 'on_the_way'].includes(activeBooking.status) && !workerChangeUsed && (
          <button
            onClick={() => openExternalUrl('tel:8008180018')}
            className="mt-2 ml-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Need a different worker? Call us
          </button>
        )}

        {/* Report Issue — only when a worker is assigned and booking is active */}
        {!isCancelled && activeBooking.worker_id && (
          <div className="mt-3 ml-1 flex justify-end">
            <ReportIssueButton
              bookingId={activeBooking.id}
              workerId={activeBooking.worker_id}
              status={activeBooking.status}
              hasWorker={!!activeBooking.worker_id}
            />
          </div>
        )}
      </Card>

      {/* OTP Bottom Sheet — only mount when relevant to avoid portal teardown races */}
      {showOtpRow && (
      <Sheet open={showOtpSheet} onOpenChange={setShowOtpSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-10 pt-6">
          <SheetHeader className="text-center sm:text-center">
            <div className="mx-auto mb-2 p-3 rounded-2xl bg-emerald-50 w-fit">
              <KeyRound className="w-5 h-5 text-emerald-700" />
            </div>
            <SheetTitle className="text-center">Completion OTP</SheetTitle>
            <SheetDescription className="text-center">
              Share this OTP with your worker only after the work is fully completed.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex items-center justify-center gap-3">
            {(activeBooking.completion_otp || '').split('').map((digit, i) => (
              <span
                key={i}
                className="w-20 h-24 flex items-center justify-center bg-emerald-50 ring-2 ring-emerald-200 rounded-2xl text-5xl font-extrabold text-emerald-900 tabular-nums shadow-sm"
              >
                {digit}
              </span>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Sharing OTP early may complete the booking before the work is done.
          </p>
        </SheetContent>
      </Sheet>
      )}

      <ChatSheet open={openChat} onOpenChange={setOpenChat} booking={activeBooking} mode="user" />

      <PayWorkerManualSheet
        open={showPaySheet}
        onOpenChange={setShowPaySheet}
        bookingId={activeBooking.id}
        workerName={activeBooking.worker_name || workerPaymentInfo?.full_name || undefined}
        amount={activeBooking.price_inr ?? undefined}
        upiId={upiId}
        qrImageUrl={qrImageUrl}
        paymentStatus={paymentStatus}
      />

      {activeBooking.worker_id && activeBooking.worker_name && (
        <WorkerRatingsModal
          open={showWorkerRatings}
          onOpenChange={setShowWorkerRatings}
          workerId={activeBooking.worker_id}
          workerName={activeBooking.worker_name}
        />
      )}

      <Sheet open={showChangeWorkerSheet} onOpenChange={setShowChangeWorkerSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>Change Worker?</SheetTitle>
            <SheetDescription>
              We'll try to assign another available worker. Current worker will be notified.
            </SheetDescription>
          </SheetHeader>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setShowChangeWorkerSheet(false)} disabled={changeWorkerLoading}>
              Cancel
            </Button>
            <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleChangeWorker} disabled={changeWorkerLoading}>
              {changeWorkerLoading ? 'Reassigning…' : 'Confirm'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* unseen badge keeps unseen state warm even though chat moved to details */}
      {hasUnseenMessages && false && <span onClick={markMessagesAsSeen} />}
    </>
  );
});

ActiveBookingCard.displayName = 'ActiveBookingCard';

export { ActiveBookingCard };
