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
  wallet_refund_status?: string | null;
  wallet_refund_amount?: number | null;
  wallet_refund_reason?: string | null;
}
interface BookingCardProps {
  booking: Booking;
}
const getServiceIcon = (serviceType: string) => {
  switch (serviceType) {
    case 'maid':
      return <Sparkles className="w-5 h-5" />;
    case 'cook':
      return <ChefHat className="w-5 h-5" />;
    case 'bathroom_cleaning':
      return <ShowerHead className="w-5 h-5" />;
    default:
      return <Sparkles className="w-5 h-5" />;
  }
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
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <LoadingWorkerBadge variant="simple" size="sm" />;
      case 'assigned':
        return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
          Assigned
        </Badge>;
       case 'completed':
         return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
           Completed
         </Badge>;
       case 'cancelled':
         return <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
           Cancelled
         </Badge>;
       default:
         return <Badge variant="outline">{status}</Badge>;
    }
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

  return (
    <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300">
      {/* Header with service and status */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#ff007a] to-[#e6006a] text-white flex items-center justify-center shadow-sm">
              {getServiceIcon(booking.service_type)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
              <p className="text-xs text-gray-600">
                {booking.booking_type === 'instant' ? 'Instant' : 'Scheduled'}
                {' · '}
                {format(new Date(booking.created_at), 'dd MMM, hh:mm a')}
              </p>
            </div>
          </div>
          {getStatusBadge(row.status)}
        </div>
      </div>

      {/* Main content */}
      <div className="p-3 space-y-3">
        {/* Location */}
        <div className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
          <MapPin className="h-4 w-4 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</p>
            <p className="font-semibold text-gray-900 text-sm">{booking.community}</p>
            <p className="text-xs text-gray-600">Flat {booking.flat_no}</p>
            {booking.booking_type === 'instant' ? (
              <p className="text-xs text-gray-600 mt-0.5">
                <Clock className="h-3 w-3 inline mr-1" />
                {format(new Date(booking.created_at), 'dd MMM yyyy, hh:mm a')}
              </p>
            ) : booking.scheduled_date && booking.scheduled_time ? (
              <p className="text-xs text-gray-600 mt-0.5">
                <Clock className="h-3 w-3 inline mr-1" />
                {formatDateTime(booking.scheduled_date, booking.scheduled_time)}
              </p>
            ) : null}
          </div>
        </div>

        {/* Worker info */}
        {(assignedWorker?.worker || row.worker_name) && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
            <WorkerAvatar
              photoUrl={assignedWorker?.worker?.photo_url || row.worker_photo_url}
              name={assignedWorker?.worker?.full_name || row.worker_name}
              size="sm"
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Worker</p>
              <p className="font-semibold text-blue-900 text-sm">
                {assignedWorker?.worker?.full_name || row.worker_name}
              </p>
              
              {/* Rating display */}
              {stars > 0 && (
                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex items-center gap-1">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${i <= stars ? 'text-yellow-500' : 'text-gray-300'}`}
                          fill={i <= stars ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-600">
                      {avgRating.toFixed(1)} ({ratingsCount})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWorkerRatings(true)}
                    className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                  >
                    View Ratings
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Request different worker */}
        {(assignedWorker?.worker || row.worker_name) && ['assigned', 'accepted', 'on_the_way'].includes(row.status) && !workerChangeUsed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExternalUrl('tel:8008180018')}
            className="w-full h-8 text-xs border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            <PhoneCall className="w-3 h-3 mr-1.5" />
            Change Worker
          </Button>
        )}

        {row.status === 'assigned' && (
          <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <Timer className="h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Status</p>
              <p className="font-semibold text-emerald-900 text-sm">Worker assigned reaching in 10mins</p>
            </div>
            <AutoCompleteCountdown autoCompleteAt={row.auto_complete_at} />
          </div>
        )}

        {/* Scheduled time */}
        {booking.scheduled_date && booking.scheduled_time && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Scheduled</p>
              <p className="font-semibold text-blue-900 text-sm">
                {formatDateTime(booking.scheduled_date, booking.scheduled_time)}
              </p>
            </div>
          </div>
        )}

        {/* Discount info */}
        {row.discount_inr != null && row.discount_inr > 0 && (
          <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="text-xs font-medium text-emerald-600">Off-peak discount applied</p>
              <p className="font-semibold text-emerald-800 text-sm">-₹{row.discount_inr} saved</p>
            </div>
          </div>
        )}

        {/* Completion OTP - show for paid or pay_after_service active bookings */}
        {row.completion_otp && (row.payment_status === 'paid' || row.payment_status === 'pay_after_service') && !row.otp_verified_at && row.status !== 'cancelled' && (
          <div className="p-4 bg-white border-2 border-green-300 rounded-xl shadow-sm">
            <p className="text-[10px] font-semibold text-green-700 uppercase tracking-widest text-center mb-2">
              🔑 Completion OTP
            </p>
            <div className="flex items-center justify-center gap-2">
              {row.completion_otp.split('').map((digit, i) => (
                <span
                  key={i}
                  className="w-10 h-12 flex items-center justify-center bg-green-50 border border-green-200 rounded-lg text-xl font-bold text-green-900"
                >
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 text-center mt-2">
              Share only after work is fully completed
            </p>
          </div>
        )}

        {/* Payment status - unpaid/failed/pending booking with retry button */}
        {(row.payment_status === 'unpaid' || row.payment_status === 'failed' || row.payment_status === 'order_created' || row.payment_status === 'pending') && row.status !== 'cancelled' && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-600" />
              <p className="text-xs font-medium text-orange-800 flex-1">
                {row.payment_status === 'failed' ? 'Payment failed — tap to retry' : 'Payment pending'}
              </p>
            </div>
            <Button
              onClick={handleRetryPayment}
              disabled={retryingPayment}
              className="w-full h-9 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-lg text-xs"
            >
              {retryingPayment ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  {row.payment_status === 'failed' ? 'Retry Payment' : 'Complete Payment'} · ₹{row.price_inr || 0}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Wallet refund banner */}
        {row.wallet_refund_status === 'credited' && row.wallet_refund_amount && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-emerald-800">₹{row.wallet_refund_amount} added to wallet</p>
              <p className="text-[10px] text-emerald-600">
                {formatWalletReason(row.wallet_refund_reason)}
              </p>
            </div>
          </div>
        )}

        {row.status === "pending" && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <AssigningProgress booking={row} />
          </div>
        )}

        {/* Cancellation messages */}
        {row.status === "cancelled" && (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              {row.cancel_source === "user" ? (
                <p className="text-red-800 font-medium text-sm">
                  Booking cancelled by you. You can book again anytime.
                </p>
              ) : row.cancel_source === "admin" ? (
                <p className="text-red-800 font-medium text-sm">
                  Booking cancelled by admin - we are unable to provide helper this time. Please try again next time.
                </p>
              ) : (
                <p className="text-red-800 font-medium text-sm">
                  All workers busy in work, Book again after sometime.
                </p>
              )}
            </div>
            <Button 
              onClick={() => openExternalUrl("tel:+918008180018")}
              className="w-full h-10 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-sm"
            >
              <PhoneCall className="h-4 w-4 mr-2" />
              Call Manager
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">

          {/* Rate Worker - show for assigned/accepted/on_the_way/started/completed bookings */}
          {['assigned', 'accepted', 'on_the_way', 'started', 'completed'].includes(row.status) && row.worker_id && (
            <RateWorker 
              bookingId={row.id}
              workerId={row.worker_id}
              onSubmit={handleSubmitRating}
            />
          )}


          {/* Support button */}
          {(row.status === 'pending' || row.status === 'assigned') && (
            <Button 
              onClick={() => openExternalUrl("tel:+918008180018")}
              className="w-full h-10 bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-semibold rounded-lg shadow-sm"
            >
              <PhoneCall className="h-4 w-4 mr-2" />
              Need Help? Call Support
            </Button>
          )}

        {/* Chat Support button */}
        {(row.status === 'pending' || row.status === 'assigned') && (
          <Button 
            onClick={() => {
              markMessagesAsSeen();
              navigate('/chat');
            }}
            variant="outline"
            className="w-full h-10 border-[#ff007a] text-[#ff007a] hover:bg-[#ff007a] hover:text-white font-semibold rounded-lg shadow-sm relative"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat Support
            {hasUnseenMessages && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </Button>
        )}

          {/* Cancellation component for pending/assigned bookings */}
          {(row.status === 'pending' || row.status === 'assigned') && (
            <CancelAction 
              booking={row} 
              onCancel={() => {
                // The real-time subscription will update the booking status
                // No need for manual refresh
              }} 
            />
          )}
        </div>

      </div>

      <ChatSheet
        open={openChat} 
        onOpenChange={setOpenChat} 
        booking={row} 
        mode="user" 
      />

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
              className="flex-1 bg-[#ff007a] hover:bg-[#e6006a] text-white"
              onClick={handleChangeWorker}
              disabled={changeWorkerLoading}
            >
              {changeWorkerLoading ? 'Reassigning…' : 'Confirm'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}