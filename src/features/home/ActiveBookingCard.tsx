import React, { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ChefHat, ShowerHead, ArrowRight, X, CreditCard, PhoneCall, MessageCircle, Star, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
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
  reach_status?: string | null;
  reach_confirmed_at?: string | null;
  reach_confirmed_by?: string | null;
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

// Check if reach confirmation buttons should be shown
const shouldShowReachButtons = (booking: Booking): boolean => {
  // Only show for active statuses
  const activeStatuses = ['assigned', 'dispatched', 'on_the_way', 'accepted', 'started'];
  if (!activeStatuses.includes(booking.status)) return false;
  
  // Only show if reach_status is pending
  if (booking.reach_status && booking.reach_status !== 'pending') return false;
  
  const now = Date.now();
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  
  // Compute reference time based on booking type
  let referenceTime: number;
  
  if (booking.booking_type === 'scheduled' && booking.scheduled_date) {
    // For scheduled: use scheduled_date + scheduled_time
    const timeStr = booking.scheduled_time ? booking.scheduled_time.slice(0, 5) : '00:00';
    const scheduledDateTime = new Date(`${booking.scheduled_date}T${timeStr}:00`);
    referenceTime = scheduledDateTime.getTime();
    
    // Fallback to created_at if scheduled time is invalid
    if (isNaN(referenceTime)) {
      referenceTime = new Date(booking.created_at).getTime();
    }
  } else {
    // For instant: use created_at
    referenceTime = new Date(booking.created_at).getTime();
  }
  
  // Show buttons only after 15 minutes from reference time
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
      
      // Fetch all matching bookings with worker's current UPI and prioritize active ones over cancelled
      const { data: allBookings, error } = await supabase
        .from('bookings')
        .select('*, workers:workers!bookings_worker_id_fkey(upi_id)')
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

  // Load worker payment info (QR data)
  useEffect(() => {
    if (!activeBooking?.worker_id) {
      setWorkerPaymentInfo(null);
      return;
    }
    
    supabase
      .from('workers')
      .select('upi_id, upi_qr_payload, upi_qr_url, full_name')
      .eq('id', activeBooking.worker_id)
      .maybeSingle()
      .then(({ data }) => setWorkerPaymentInfo(data ?? null));
  }, [activeBooking?.worker_id]);

  // Load payment status
  useEffect(() => {
    if (!activeBooking?.id) return;
    
    supabase
      .from('bookings')
      .select('payment_status')
      .eq('id', activeBooking.id)
      .maybeSingle()
      .then(({ data }) => {
        setPaymentStatus(data?.payment_status || 'pending');
      });
  }, [activeBooking?.id]);

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

  // Check reach buttons visibility with interval
  useEffect(() => {
    if (!activeBooking) {
      setReachButtonsVisible(false);
      return;
    }

    const checkVisibility = () => {
      setReachButtonsVisible(shouldShowReachButtons(activeBooking));
    };

    checkVisibility();
    // Re-check every 30 seconds to update when 15 minutes pass
    const interval = setInterval(checkVisibility, 30000);

    return () => clearInterval(interval);
  }, [activeBooking]);

  // Fetch assignment count for change worker limit
  useEffect(() => {
    if (!activeBooking?.id) return;
    supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', activeBooking.id)
      .then(({ count }) => {
        setAssignmentCount(count ?? 0);
      });
  }, [activeBooking?.id, activeBooking?.worker_id]);

  const workerChangeUsed = assignmentCount >= 2;

  if (loading || !activeBooking) {
    return null;
  }

  const handleChangeWorker = async () => {
    setChangeWorkerLoading(true);
    try {
      const { error: cancelErr } = await supabase
        .from('assignments')
        .update({ status: 'cancelled' })
        .eq('booking_id', activeBooking.id)
        .eq('status', 'assigned');
      if (cancelErr) throw cancelErr;

      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({
          status: 'pending',
          worker_id: null,
          worker_name: null,
          worker_phone: null,
          worker_photo_url: null,
          worker_upi: null,
          assigned_at: null,
        })
        .eq('id', activeBooking.id);
      if (bookingErr) throw bookingErr;

      const { error: dispatchErr } = await supabase.functions.invoke('scheduled-dispatch', {
        body: { booking_id: activeBooking.id },
      });
      if (dispatchErr) throw dispatchErr;

      toast.success('Looking for another worker…');
      setShowChangeWorkerSheet(false);
    } catch (err: any) {
      console.error('Change worker error:', err);
      if (err?.message?.includes('No') || err?.message?.includes('no')) {
        toast.error('No alternate worker available right now.');
      } else {
        toast.error('Could not change worker. Try again.');
      }
    } finally {
      setChangeWorkerLoading(false);
    }
  };

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
          booking_id: activeBooking.id,
          worker_id: activeBooking.worker_id,
          user_id: profile.id,
          rating,
          comment: comment ?? null,
        },
        { onConflict: 'booking_id' }
      );

    if (error) throw error;
  };

  const handleReachConfirmation = async (reached: boolean) => {
    if (updatingReachStatus) return;
    
    setUpdatingReachStatus(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          reach_status: reached ? 'reached' : 'not_reached',
          reach_confirmed_at: new Date().toISOString(),
          reach_confirmed_by: 'user',
        })
        .eq('id', activeBooking.id);

      if (error) throw error;

      // Send push notification to admins when worker not reached
      if (!reached) {
        const workerName = activeBooking.worker_name || 'Worker';
        const flatNo = activeBooking.flat_no || 'Unknown';
        const community = activeBooking.community || '';
        const serviceType = activeBooking.service_type || 'Service';
        
        // Fire and forget - don't block UI for notification
        supabase.functions.invoke('send-admin-fcm', {
          body: {
            title: '⚠️ Worker Not Reached',
            body: `${workerName} has not reached Flat ${flatNo} (${community}) for ${serviceType}. Action needed!`,
            notification_type: 'worker_not_reached',
            data: {
              booking_id: activeBooking.id,
              worker_name: workerName,
              flat_no: flatNo,
              community: community,
              service_type: serviceType,
            },
          },
        }).then(res => {
          if (res.error) {
            console.error('[ReachStatus] Admin notification error:', res.error);
          } else {
            console.log('[ReachStatus] Admin notification sent:', res.data);
          }
        }).catch(err => {
          console.error('[ReachStatus] Admin notification failed:', err);
        });

        // Also send Telegram alert for worker not reached
        supabase.functions.invoke('send-telegram-alert', {
          body: {
            message: `⚠️ WORKER NOT REACHED\nWorker: ${workerName}\nFlat: ${flatNo} (${community})\nService: ${serviceType}\nBooking ID: ${activeBooking.id}\nAction needed immediately!`,
          },
        }).catch(err => {
          console.error('[ReachStatus] Telegram notification failed:', err);
        });
      }

      if (reached) {
        toast.success("Thanks for confirming. Worker has reached.");
      } else {
        toast.info("Thanks. Our team will take action immediately.");
      }
      
      // Update local state to hide buttons
      setActiveBooking(prev => prev ? { 
        ...prev, 
        reach_status: reached ? 'reached' : 'not_reached' 
      } : null);
      setReachButtonsVisible(false);
    } catch (error) {
      console.error('[ReachStatus] Error:', error);
      toast.error("Could not update status. Please try again.");
    } finally {
      setUpdatingReachStatus(false);
    }
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

      {/* Change Worker Button */}
      {activeBooking.worker_name && ['assigned', 'accepted', 'on_the_way'].includes(activeBooking.status) && !workerChangeUsed && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowChangeWorkerSheet(true)}
          className="w-full h-8 text-xs border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/40 mb-3"
        >
          <RefreshCw className="w-3 h-3 mr-1.5" />
          Change Worker
        </Button>
      )}

      {activeBooking.status === 'pending' && (
        <AssigningProgress booking={activeBooking} />
      )}

      {/* Cancellation messages */}
      {activeBooking.status === "cancelled" && (
        <div className="space-y-3 mb-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            {activeBooking.cancel_source === "user" ? (
              <p className="text-red-800 font-medium text-sm">
                Booking cancelled by you. You can book again anytime.
              </p>
            ) : activeBooking.cancel_source === "admin" ? (
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

      {/* Worker Reach Confirmation Buttons */}
      {reachButtonsVisible && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-900 mb-3">
            Did the worker reach your location?
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => handleReachConfirmation(true)}
              disabled={updatingReachStatus}
              className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Reached
            </Button>
            <Button
              onClick={() => handleReachConfirmation(false)}
              disabled={updatingReachStatus}
              variant="destructive"
              className="flex-1 h-10 font-semibold rounded-lg"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Not Reached
            </Button>
          </div>
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

        {/* Support buttons - side by side */}
        {(activeBooking.status === 'pending' || activeBooking.status === 'assigned') && (
          <div className="flex gap-2">
            <Button 
              onClick={() => openExternalUrl("tel:+918008180018")}
              className="flex-1 h-10 bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white font-semibold rounded-lg shadow-sm text-xs"
            >
              <PhoneCall className="h-4 w-4 mr-1.5" />
              Call Support
            </Button>
            <Button 
              onClick={() => {
                markMessagesAsSeen();
                navigate('/chat');
              }}
              variant="outline"
              className="flex-1 h-10 border-[#ff007a] text-[#ff007a] hover:bg-[#ff007a] hover:text-white font-semibold rounded-lg shadow-sm text-xs relative"
            >
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Chat Support
              {hasUnseenMessages && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              )}
            </Button>
          </div>
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

      {/* Pay Worker Manual Sheet */}
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

      {/* Worker Ratings Modal */}
      {activeBooking.worker_id && activeBooking.worker_name && (
        <WorkerRatingsModal
          open={showWorkerRatings}
          onOpenChange={setShowWorkerRatings}
          workerId={activeBooking.worker_id}
          workerName={activeBooking.worker_name}
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
    </Card>
  );
});

ActiveBookingCard.displayName = 'ActiveBookingCard';

export { ActiveBookingCard };