import React, { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, ChefHat, ShowerHead, ArrowRight, X, CreditCard, PhoneCall, MessageCircle, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { prettyServiceName } from '@/features/booking/utils';
import AssigningProgress from '@/features/bookings/AssigningProgress';
import AutoCompleteCountdown from '@/components/AutoCompleteCountdown';
import { launchUpiPayment } from '@/utils/launchUpiPayment';
import UpiChooser from '@/components/UpiChooser';
import { useNow } from '@/hooks/useNow';
import { toast } from 'sonner';
import { RateWorker } from '@/features/bookings/RateWorker';
import { openExternalUrl } from '@/lib/nativeOpen';
import ChatSheet from '@/features/chat/ChatSheet';
import { LoadingWorkerBadge } from '@/components/LoadingWorkerBadge';
import { WorkerRatingsModal } from '@/features/bookings/WorkerRatingsModal';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';

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
  cancelled_at?: string | null;
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

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'assigned':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
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
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showUpiChooser, setShowUpiChooser] = useState(false);
  const [showWorkerRatings, setShowWorkerRatings] = useState(false);

  const fetchActiveBooking = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayStart = startOfToday.toISOString();
      
      // Fetch all matching bookings with worker's current UPI and prioritize active ones over cancelled
      const { data: allBookings, error } = await supabase
        .from('bookings')
        .select('*, workers:worker_id(upi_id)')
        .eq('user_id', profile.id)
        .or(`and(status.in.(pending,assigned,accepted,on_the_way,started),booking_type.eq.instant),and(status.in.(pending,assigned,accepted,on_the_way,started),booking_type.eq.scheduled,scheduled_date.gte.${today}),and(status.eq.cancelled,cancelled_at.gte.${todayStart})`)
        .order('created_at', { ascending: false });

      // Prioritize active bookings over cancelled ones
      let bookingToShow = null;
      if (allBookings && allBookings.length > 0) {
        // First priority: show active bookings (pending, assigned, etc.) that haven't been dismissed
        const activeBooking = allBookings.find(b => 
          b.status !== 'cancelled' && !dismissedBookings.has(b.id)
        );
        
        // Second priority: show cancelled bookings from today (if no active booking)
        const cancelledBooking = allBookings.find(b => 
          b.status === 'cancelled' && !dismissedBookings.has(b.id)
        );
        
        const rawBooking = activeBooking || cancelledBooking;
        if (rawBooking) {
          // Use worker's current UPI if booking snapshot is missing it
          const workerData = rawBooking.workers as { upi_id: string | null } | null;
          bookingToShow = {
            ...rawBooking,
            worker_upi: rawBooking.worker_upi || workerData?.upi_id || null,
            workers: undefined // Remove the join data
          };
        }
      }

      if (error) {
        console.error('Error fetching active booking:', error);
      } else {
        setActiveBooking(bookingToShow || null);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  // Load dismissed bookings from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedBookings');
    if (dismissed) {
      setDismissedBookings(new Set(JSON.parse(dismissed)));
    }
  }, []);

  useEffect(() => {
    if (profile?.id) {
      fetchActiveBooking();
    } else {
      setLoading(false);
      setActiveBooking(null);
    }
  }, [profile?.id]);

  // Load worker rating stats
  useEffect(() => {
    if (!activeBooking?.worker_id) {
      setWorkerStats(null);
      return;
    }
    
    supabase
      .from('worker_rating_stats')
      .select('avg_rating, ratings_count')
      .eq('worker_id', activeBooking.worker_id)
      .maybeSingle()
      .then(({ data }) => setWorkerStats(data ?? null));
  }, [activeBooking?.worker_id]);

  // Set up real-time updates
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`active-booking-updates-${profile.id}`)
      .on("postgres_changes", 
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "bookings",
          filter: `user_id=eq.${profile.id}`
        },
        (payload) => {
          // Refetch whenever any booking changes to catch new cancellations
          fetchActiveBooking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, fetchActiveBooking]);

  if (loading || !activeBooking) {
    return null;
  }

  const handleViewDetails = () => {
    navigate('/bookings');
  };

  const handleDismiss = () => {
    const newDismissed = new Set(dismissedBookings);
    newDismissed.add(activeBooking.id);
    setDismissedBookings(newDismissed);
    localStorage.setItem('dismissedBookings', JSON.stringify([...newDismissed]));
    // Immediately hide the card
    setActiveBooking(null);
  };

  // Check if payment should be enabled (show immediately when assigned)
  const isAssigned = activeBooking.status === 'assigned';
  const paymentReady = isAssigned;

  const handlePayWorker = () => {
    // Ensure payment amount starts empty
    setPaymentAmount('');
    setShowPaymentDialog(true);
  };

  const handleConfirmPayment = async () => {
    const workerUpi = activeBooking.worker_upi;
    const workerName = activeBooking.worker_name || 'Worker';
    const amount = parseFloat(paymentAmount);

    if (!workerUpi) {
      toast.error("Worker account not updated, pay cash to worker");
      return;
    }

    if (!paymentAmount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const note = `Didi Now ${activeBooking.service_type} • ${activeBooking.community} • ${activeBooking.flat_no}`;

    const paymentParams = {
      pa: workerUpi,
      pn: workerName,
      am: amount.toString(),
      tn: note,
      tr: activeBooking.id
    };

    try {
      // Mark that user tapped pay
      await supabase
        .from('bookings')
        .update({ user_marked_paid_at: new Date().toISOString() })
        .eq('id', activeBooking.id);
      
      setShowPaymentDialog(false);
      
      console.log('[UPI] params', paymentParams);
      
      await launchUpiPayment({
        ...paymentParams,
        onNeedChooser: setShowUpiChooser
      });
      
      toast.success("Opening UPI app...");
    } catch (error) {
      toast.error("Please ensure a UPI app (GPay/PhonePe/Paytm) is installed");
    }
  };

  const handleSubmitRating = async (rating: number, comment?: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    await supabase.from('worker_ratings').insert({
      booking_id: activeBooking.id,
      worker_id: activeBooking.worker_id,
      user_id: user.id,
      rating,
      comment: comment ?? null,
    });
  };

  return (
    <Card className={`p-4 border-2 ${
      activeBooking.status === 'assigned' 
        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
        : 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            activeBooking.status === 'assigned' ? 'bg-green-100' : 'bg-primary/10'
          }`}>
            {getServiceIcon(activeBooking.service_type)}
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {prettyServiceName(activeBooking.service_type)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {activeBooking.community} • {activeBooking.flat_no}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeBooking.status === 'pending' ? (
            <LoadingWorkerBadge variant="simple" size="sm" />
          ) : (
            <Badge className={`text-xs ${getStatusColor(activeBooking.status)}`}>
              {activeBooking.status === 'assigned' ? '✓ Worker Assigned' : activeBooking.status}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="p-1 h-6 w-6 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {activeBooking.worker_name && (
        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Worker</p>
          <p className="text-sm font-semibold text-blue-900">{activeBooking.worker_name}</p>
          
          {/* Worker rating display */}
          {workerStats && workerStats.avg_rating > 0 && (
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${i <= Math.round(workerStats.avg_rating) ? 'text-yellow-500' : 'text-gray-300'}`}
                      fill={i <= Math.round(workerStats.avg_rating) ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-600">
                  {workerStats.avg_rating.toFixed(1)} ({workerStats.ratings_count})
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
      )}

      {activeBooking.status === 'pending' && (
        <AssigningProgress booking={activeBooking} />
      )}

      {/* Cancellation messages */}
      {activeBooking.status === "cancelled" && (
        <div className="space-y-3 mb-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            {activeBooking.cancel_source === "admin" ? (
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
      <div className="space-y-2 mb-4">
        {/* Pay Now Button - shows when assigned and has UPI */}
        {paymentReady && (
          <Button 
            onClick={handlePayWorker}
            className="w-full h-10 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-sm"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Pay to worker {activeBooking.worker_name || 'Worker'}
          </Button>
        )}

        {/* Rate Worker - show for assigned/completed bookings */}
        {(activeBooking.status === 'assigned' || activeBooking.status === 'completed') && activeBooking.worker_id && (
          <RateWorker 
            bookingId={activeBooking.id}
            workerId={activeBooking.worker_id}
            onSubmit={handleSubmitRating}
          />
        )}

        {/* Scheduled booking info */}
        {activeBooking.booking_type === 'scheduled' && (activeBooking.status === 'pending' || activeBooking.status === 'assigned') && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              For scheduled bookings, we will assign worker 15 mins before scheduled time, don't worry
            </p>
          </div>
        )}

        {/* Support button */}
        {(activeBooking.status === 'pending' || activeBooking.status === 'assigned') && (
          <Button 
            onClick={() => openExternalUrl("tel:+918008180018")}
            className="w-full h-10 bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-semibold rounded-lg shadow-sm"
          >
            <PhoneCall className="h-4 w-4 mr-2" />
            Need Help? Call Support
          </Button>
        )}

        {/* Chat Support button */}
        {(activeBooking.status === 'pending' || activeBooking.status === 'assigned') && (
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

      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-muted-foreground">
          {activeBooking.booking_type === 'instant' ? 'Instant Booking' : 'Scheduled Booking'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewDetails}
          className="text-primary hover:text-primary/80"
        >
          View Details
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <ChatSheet 
        open={openChat} 
        onOpenChange={setOpenChat} 
        booking={activeBooking} 
        mode="user" 
      />

      {/* Payment Amount Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter Payment Amount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="numeric"
                placeholder="Enter amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-lg font-semibold"
                autoFocus={false}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Booking amount: ₹{activeBooking.price_inr}
            </p>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> Pay to worker after work completed & ask her amount and enter based on that, this price is not fixed currently.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPayment}
              className="bg-green-600 hover:bg-green-700"
            >
              Pay Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UPI App Chooser for iOS */}
      {activeBooking && (
         <UpiChooser
           open={showUpiChooser}
           onOpenChange={setShowUpiChooser}
           paymentParams={{
             pa: activeBooking.worker_upi || '',
             pn: activeBooking.worker_name || 'Worker',
             am: paymentAmount,
             tn: `Didi Now ${activeBooking.service_type} • ${activeBooking.community} • ${activeBooking.flat_no}`,
             tr: activeBooking.id
           }}
          />
       )}

      {/* Worker Ratings Modal */}
      {activeBooking.worker_id && activeBooking.worker_name && (
        <WorkerRatingsModal
          open={showWorkerRatings}
          onOpenChange={setShowWorkerRatings}
          workerId={activeBooking.worker_id}
          workerName={activeBooking.worker_name}
        />
      )}
    </Card>
  );
});

ActiveBookingCard.displayName = 'ActiveBookingCard';

export { ActiveBookingCard };