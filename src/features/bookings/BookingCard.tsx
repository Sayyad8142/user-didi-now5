import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { prettyServiceName } from '@/features/booking/utils';
import { formatDateTime } from '@/features/bookings/dt';
import { format } from 'date-fns';
import { PhoneCall, Sparkles, ChefHat, ShowerHead, Clock, User, MapPin, Timer, CreditCard, Star, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AssigningProgress from '@/features/bookings/AssigningProgress';
import AutoCompleteCountdown from '@/components/AutoCompleteCountdown';
import { useBookingRealtime } from '@/features/bookings/useBookingRealtime';
import { launchUpiPayment } from '@/utils/launchUpiPayment';
import UpiChooser from '@/components/UpiChooser';
import { PaymentConfirmationDialog } from '@/components/PaymentConfirmationDialog';
import { toast } from 'sonner';
import { useNow } from '@/hooks/useNow';
import CancelAction from './CancelAction';
import { RateWorker } from './RateWorker';
import { openExternalUrl } from '@/lib/nativeOpen';
import ChatSheet from '@/features/chat/ChatSheet';
import { LoadingWorkerBadge } from '@/components/LoadingWorkerBadge';
import { WorkerRatingsModal } from './WorkerRatingsModal';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { CallHistory } from '@/components/calling/CallHistory';
import { IncomingCallScreen } from '@/components/calling/IncomingCallScreen';
import { useIncomingRtcPush } from '@/hooks/useIncomingRtcPush';
import { useAppResume } from '@/hooks/useAppResume';

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
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  const { incomingCall, clearIncomingCall } = useIncomingRtcPush();
  const [assignedWorker, setAssignedWorker] = useState<any>(null);
  const [loadingWorker, setLoadingWorker] = useState(true);
  const [row, setRow] = useState(booking);
  const [workerStats, setWorkerStats] = useState<{ avg_rating: number; ratings_count: number } | null>(null);
  const [openChat, setOpenChat] = useState(false);
  const [showUpiChooser, setShowUpiChooser] = useState(false);
  const [showWorkerRatings, setShowWorkerRatings] = useState(false);
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const now = useNow(); // ticks every 30s
  
  // Resume detection for UPI payment return
  const handlePaymentReturn = useCallback(() => {
    setShowPaymentConfirmation(true);
  }, []);
  const { setPending: setPaymentPending } = useAppResume(handlePaymentReturn);
  
  // Subscribe to real-time updates for this specific booking
  useBookingRealtime(booking.id, (updatedBooking) => setRow(updatedBooking));
  
  // Load worker rating stats
  useEffect(() => {
    if (!row.worker_id) {
      setWorkerStats(null);
      return;
    }
    
    supabase
      .from('worker_rating_stats')
      .select('avg_rating, ratings_count')
      .eq('worker_id', row.worker_id)
      .maybeSingle()
      .then(({ data }) => setWorkerStats(data ?? null));
  }, [row.worker_id]);

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

  const handlePayWorker = async () => {
    const workerUpi = row.worker_upi || assignedWorker?.worker?.upi_id;
    const workerName = row.worker_name || assignedWorker?.worker?.full_name || 'Worker';

    if (!workerUpi) {
      toast.error("Worker account not updated, pay cash to worker");
      return;
    }

    try {
      const success = await launchUpiPayment({
        pa: workerUpi,
        pn: workerName,
        am: row.price_inr ?? undefined,
        bookingId: row.id,
        onNeedChooser: setShowUpiChooser,
        onPaymentLaunched: setPaymentPending,
      });
      
      if (success) {
        toast.success("Opening UPI app...");
      }
    } catch (error) {
      console.error('[UPI] Error:', error);
      toast.error("Please ensure a UPI app (GPay/PhonePe/Paytm) is installed");
    }
  };

  const handlePaymentConfirmed = async (utr?: string) => {
    try {
      await supabase
        .from('bookings')
        .update({ 
          user_marked_paid_at: new Date().toISOString(),
          user_payment_utr: utr || null,
        })
        .eq('id', row.id);
      
      toast.success("Payment confirmed! Thank you.");
    } catch (error) {
      console.error('[Payment] Error confirming:', error);
      toast.error("Could not update payment status");
    }
  };

  const handlePaymentCancelled = () => {
    toast.info("Payment not completed. You can try again.");
  };

  const handleSubmitRating = async (rating: number, comment?: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    await supabase.from('worker_ratings').insert({
      booking_id: row.id,
      worker_id: row.worker_id,
      user_id: user.id,
      rating,
      comment: comment ?? null,
    });
  };

  const handleInitiateCall = async () => {
    try {
      toast.loading('Connecting call...', { id: 'initiating-call' });
      
      const { data, error } = await supabase.functions.invoke('create-rtc-call', {
        body: { booking_id: row.id },
      });

      toast.dismiss('initiating-call');

      if (error) throw error;

      if (data?.success) {
        navigate('/call', {
          state: {
            rtcCallId: data.rtc_call_id,
            roomId: data.room_id,
            roomUrl: data.room_url,
            token: data.caller_token,
            callerName: row.worker_name || 'Worker',
            initialState: 'dialing',
          },
        });
      } else {
        throw new Error(data?.error || 'Failed to initiate call');
      }
    } catch (error) {
      console.error('Error initiating call:', error);
      toast.dismiss('initiating-call');
      toast.error('Could not start call. Please try again.');
    }
  };

  // Display rating stars
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
            <Avatar className="w-8 h-8 mt-0.5">
              <AvatarImage src={assignedWorker?.worker?.photo_url || row.worker_photo_url || undefined} />
              <AvatarFallback>
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
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

        {/* Time info and auto-complete countdown */}
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

        {/* Status content */}
        {row.status === "pending" && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <AssigningProgress booking={row} />
          </div>
        )}

        {/* Cancellation messages */}
        {row.status === "cancelled" && (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              {row.cancel_source === "admin" ? (
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
          {/* Pay Now Button - shows after 30 minutes from assignment */}
          {paymentReady && (
            <Button 
              onClick={handlePayWorker}
              className="w-full h-10 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-sm"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Pay to worker {row.worker_name || assignedWorker?.worker?.full_name || 'Worker'}
            </Button>
          )}

          {/* Rate Worker - show for assigned/accepted/on_the_way/started/completed bookings */}
          {['assigned', 'accepted', 'on_the_way', 'started', 'completed'].includes(row.status) && row.worker_id && (
            <RateWorker 
              bookingId={row.id}
              workerId={row.worker_id}
              onSubmit={handleSubmitRating}
            />
          )}

          {/* VoIP Call Button - show for assigned/accepted/on_the_way/started bookings */}
          {['assigned', 'accepted', 'on_the_way', 'started'].includes(row.status) && row.worker_id && (
            <div className="space-y-2">
              <Button 
                onClick={handleInitiateCall}
                disabled
                className="w-full h-10 bg-gray-300 text-gray-500 font-semibold rounded-lg opacity-50 cursor-not-allowed"
              >
                <PhoneCall className="h-4 w-4 mr-2" />
                Call to worker (coming soon)
              </Button>
            </div>
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

        {/* Call History - show for assigned and active bookings */}
        {['assigned', 'accepted', 'on_the_way', 'started', 'completed'].includes(row.status) && (
          <CallHistory bookingId={row.id} />
        )}
      </div>

      <ChatSheet
        open={openChat} 
        onOpenChange={setOpenChat} 
        booking={row} 
        mode="user" 
      />

      {/* UPI App Chooser */}
       <UpiChooser
         open={showUpiChooser}
         onOpenChange={setShowUpiChooser}
         upiId={row.worker_upi || assignedWorker?.worker?.upi_id || ''}
         workerName={row.worker_name || assignedWorker?.worker?.full_name}
         bookingId={row.id}
         amount={row.price_inr ?? undefined}
         onPaymentLaunched={setPaymentPending}
       />

      {/* Payment Confirmation Dialog */}
      <PaymentConfirmationDialog
        open={showPaymentConfirmation}
        onOpenChange={setShowPaymentConfirmation}
        workerName={row.worker_name || assignedWorker?.worker?.full_name || 'Worker'}
        amount={row.price_inr ?? undefined}
        onConfirmPaid={handlePaymentConfirmed}
        onCancel={handlePaymentCancelled}
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

      {/* Incoming Call Modal */}
      {incomingCall && incomingCall.booking_id === row.id && (
        <IncomingCallScreen
          rtcCallId={incomingCall.rtc_call_id}
          callerName={incomingCall.caller_name || 'Someone'}
          onDismiss={clearIncomingCall}
        />
      )}
    </Card>
  );
}