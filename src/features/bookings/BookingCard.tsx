import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useNow } from '@/hooks/useNow';
import { toast } from 'sonner';
import CancelAction from './CancelAction';
import { RateWorker } from './RateWorker';
import { openExternalUrl } from '@/lib/nativeOpen';
import ChatSheet from '@/features/chat/ChatSheet';
import { LoadingWorkerBadge } from '@/components/LoadingWorkerBadge';

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
  const [assignedWorker, setAssignedWorker] = useState<any>(null);
  const [loadingWorker, setLoadingWorker] = useState(true);
  const [row, setRow] = useState(booking);
  const [workerStats, setWorkerStats] = useState<{ avg_rating: number; ratings_count: number } | null>(null);
  const [openChat, setOpenChat] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showUpiChooser, setShowUpiChooser] = useState(false);
  const now = useNow(); // ticks every 30s
  
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

  // Check if payment should be enabled (show immediately when assigned)
  const isAssigned = row.status === 'assigned';
  const paymentReady = isAssigned;

  const handlePayWorker = () => {
    // Set default amount to booking price
    setPaymentAmount(row.price_inr?.toString() || '');
    setShowPaymentDialog(true);
  };

  const handleConfirmPayment = async () => {
    const workerUpi = row.worker_upi || assignedWorker?.worker?.upi_id;
    const workerName = row.worker_name || assignedWorker?.worker?.full_name || 'Worker';
    const amount = parseFloat(paymentAmount);

    if (!workerUpi) {
      toast.error("Worker account details not updated, cash to worker");
      return;
    }

    if (!paymentAmount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const note = `Didi Now ${row.service_type} • ${row.community} • ${row.flat_no}`;

    try {
      // Mark that user tapped pay
      await supabase
        .from('bookings')
        .update({ user_marked_paid_at: new Date().toISOString() })
        .eq('id', row.id);
      
      setShowPaymentDialog(false);
      
      console.log('[UPI] params', { pa: workerUpi, pn: workerName, am: amount.toString(), tn: note, tr: row.id });
      
      await launchUpiPayment({
        pa: workerUpi,
        pn: workerName,
        am: amount.toString(),
        tn: note,
        tr: row.id,
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
      booking_id: row.id,
      worker_id: row.worker_id,
      user_id: user.id,
      rating,
      comment: comment ?? null,
    });
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
                <div className="flex items-center gap-1 mt-0.5">
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

        {/* Admin cancellation message */}
        {row.status === "cancelled" && row.cancel_source === "admin" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 font-medium text-sm">
              Booking cancelled by admin - we are unable to provide helper this time. Please try again next time.
            </p>
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

          {/* Rate Worker - show for assigned/completed bookings */}
          {(row.status === 'assigned' || row.status === 'completed') && row.worker_id && (
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
            onClick={() => navigate('/chat')}
            variant="outline"
            className="w-full h-10 border-[#ff007a] text-[#ff007a] hover:bg-[#ff007a] hover:text-white font-semibold rounded-lg shadow-sm"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat Support
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
                placeholder="Enter amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-lg font-semibold"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Booking amount: ₹{row.price_inr}
            </p>
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
       <UpiChooser
         open={showUpiChooser}
         onOpenChange={setShowUpiChooser}
         paymentParams={{
           pa: row.worker_upi || '',
           pn: row.worker_name || 'Worker',
           am: paymentAmount,
           tn: `Didi Now ${row.service_type} • ${row.community} • ${row.flat_no}`,
           tr: row.id
         }}
       />
    </Card>
  );
}