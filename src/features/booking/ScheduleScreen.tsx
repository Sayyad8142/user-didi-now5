import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Home, MapPin, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { executePaymentFlow, executePaymentFlowForNewBooking, PaymentError, type PaymentFlowStatus, type PaymentErrorType } from '@/lib/paymentService';
import { PaymentMethodSelector, type PaymentMethod } from '@/components/PaymentMethodSelector';
import { PaymentRetrySheet } from '@/components/PaymentRetrySheet';
import { trackPaymentEvent } from '@/lib/paymentAnalytics';
import { useWalletBalance } from '@/hooks/useWallet';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import { prettyServiceName, isValidServiceType, getPricingMap } from './pricing';
import { useFlatSize } from '@/hooks/useFlatSize';
import { 
  makeSlots, 
  toDisplay12h, 
  isPastToday, 
  getDateChips,
  TIME_SEGMENTS,
  TIME_SEGMENTS_COOK,
  type TimeSegment 
} from './slot-utils';
import { useSlotSurge } from '@/hooks/useSlotSurge';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Check if time slot is between 3PM (15:00) and 7PM (19:00)
const isLimitedAvailabilitySlot = (time: string): boolean => {
  const [hours] = time.split(':').map(Number);
  return hours >= 15 && hours <= 19;
};

export function ScheduleScreen() {
  const { service_type } = useParams<{ service_type: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { toast } = useToast();
  const { flatSize: autoFlatSize } = useFlatSize();
  const { data: walletData } = useWalletBalance();
  const walletBalance = walletData?.balance_inr ?? 0;

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Auto-select the first date that has available (non-past) slots
    const chips = getDateChips();
    const allSegments: TimeSegment[] = ['Morning', 'Afternoon', 'Evening'];
    for (const chip of chips.slice(0, 4)) {
      const hasSlot = allSegments.some(seg => {
        const slots = makeSlots(TIME_SEGMENTS[seg].start, TIME_SEGMENTS[seg].end);
        return slots.some(slot => !isPastToday(slot, chip.date));
      });
      if (hasSlot) return chip.date;
    }
    return new Date();
  });
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [activeSegment, setActiveSegment] = useState<TimeSegment>('Morning');
  const [initialSegmentSet, setInitialSegmentSet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentFlowStatus | null>(null);
  const [showAvailabilityWarning, setShowAvailabilityWarning] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_now');
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [unavailableSlots, setUnavailableSlots] = useState<Set<string>>(new Set());
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Retry state
  const [retrySheetOpen, setRetrySheetOpen] = useState(false);
  const [retryErrorType, setRetryErrorType] = useState<PaymentErrorType>('payment_failed');
  const [retryErrorMessage, setRetryErrorMessage] = useState<string | undefined>();
  const [retryBookingId, setRetryBookingId] = useState<string | null>(null);
  const [retryBookingCreatedAt, setRetryBookingCreatedAt] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Dynamic slot surge pricing
  const { getSurge } = useSlotSurge(profile?.community_id, service_type || 'maid');

  // Use flat size from hook (admin-managed) instead of URL param
  const flatSize = autoFlatSize || searchParams.get('flat');
  const priceParam = searchParams.get('price');
  const familyCount = searchParams.get('family');
  const foodPreference = searchParams.get('food') as 'veg' | 'non_veg' | null;
  const cuisinePref = searchParams.get('cuisine') as 'north' | 'south' | 'any' | null;
  const genderPref = searchParams.get('gender') as 'male' | 'female' | 'any' | null;
  const bathroomCount = searchParams.get('bathrooms');
  const hasGlassPartition = searchParams.get('glass') === '1';
  const tasksParam = searchParams.get('tasks');
  const dishIntensity = searchParams.get('dish_intensity') as 'light' | 'medium' | 'heavy' | null;
  const dishIntensityExtra = parseInt(searchParams.get('dish_extra') || '0');
  const GLASS_PARTITION_FEE = 30;

  useEffect(() => {
    // Don't redirect - ProtectedRoute handles auth check
    if (service_type && !isValidServiceType(service_type)) {
      navigate('/home');
      return;
    }
  }, [service_type, navigate]);

  // Auto-select the first time segment that has available slots for today
  useEffect(() => {
    if (initialSegmentSet) return;
    const today = new Date();
    if (selectedDate.toDateString() !== today.toDateString()) return;
    
    const segments: TimeSegment[] = ['Morning', 'Afternoon', 'Evening'];
    for (const seg of segments) {
      const slots = makeSlots(TIME_SEGMENTS[seg].start, TIME_SEGMENTS[seg].end);
      const hasAvailable = slots.some(slot => !isPastToday(slot, selectedDate));
      if (hasAvailable) {
        setActiveSegment(seg);
        setInitialSegmentSet(true);
        return;
      }
    }
    setInitialSegmentSet(true);
  }, [selectedDate]);

  // Fetch slot availability when date or community changes
  useEffect(() => {
    if (!selectedDate || !profile?.community || !service_type) {
      setUnavailableSlots(new Set());
      return;
    }

    let cancelled = false;
    const fetchAvailability = async () => {
      setLoadingAvailability(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data, error } = await supabase.rpc('get_scheduled_slot_availability', {
          p_community: profile.community,
          p_service_type: service_type,
          p_date: dateStr,
        });
        if (error || cancelled) return;
        const unavailable = new Set<string>();
        ((data as any[]) || []).forEach((row: { slot_time: string; worker_count: number }) => {
          if (row.worker_count < 1) {
            // Normalize "HH:MM:SS" from DB to "HH:MM" to match makeSlots format
            const normalized = row.slot_time.length > 5 ? row.slot_time.slice(0, 5) : row.slot_time;
            unavailable.add(normalized);
          }
        });
        setUnavailableSlots(unavailable);
      } catch (err) {
        console.error('Slot availability fetch failed:', err);
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    };

    fetchAvailability();
    return () => { cancelled = true; };
  }, [selectedDate, profile?.community, service_type]);

  useEffect(() => {
    if (priceParam) {
      setPrice(parseInt(priceParam));
    } else if (profile && service_type && flatSize) {
      loadPrice();
    }
  }, [profile, service_type, flatSize, priceParam]);

  const loadPrice = async () => {
    if (!service_type || !profile || !flatSize) return;
    
    try {
      const pricing = await getPricingMap(service_type, profile.community);
      const flatPrice = pricing[flatSize];
      if (flatPrice) {
        setPrice(flatPrice);
      }
    } catch (error) {
      console.error('Error loading price:', error);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!selectedDate || !selectedTime || !profile || !user || !service_type || !price) {
      return;
    }
    if (service_type !== 'bathroom_cleaning' && !flatSize) return;
    if (service_type === 'bathroom_cleaning' && !bathroomCount) return;

    setSubmitting(true);
    try {
      // Format date as YYYY-MM-DD for PostgreSQL DATE column
      const scheduledDate = format(selectedDate, 'yyyy-MM-dd');
      
      // Format time as HH:MM:SS for PostgreSQL TIME column
      // Ensure we have proper HH:MM format first, then add seconds
      const timeMatch = selectedTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        console.error('❌ Invalid time format:', selectedTime);
        toast({
          title: "Invalid Time",
          description: "Please select a valid time slot.",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }
      const hours = timeMatch[1].padStart(2, '0');
      const minutes = timeMatch[2];
      const scheduledTime = `${hours}:${minutes}:00`;

      console.log('📅 Scheduled booking details:', {
        selectedDate: selectedDate.toISOString(),
        scheduledDate,
        selectedTime,
        scheduledTime,
        serviceType: service_type,
        community: profile.community,
        price
      });

      // Validate flat details are linked (required by DB trigger)
      if (service_type !== 'bathroom_cleaning' && !profile.flat_id) {
        toast({
          title: "Flat Details Missing",
          description: "Please update your flat details in Account Settings before booking.",
          variant: "destructive"
        });
        navigate('/profile/settings');
        setSubmitting(false);
        return;
      }

      // Calculate surge from dynamic slot_surge_pricing
      const surcharge = getSurge(selectedTime);
      const finalPrice = price + surcharge;

      const bookingData = {
        user_id: profile.id,
        service_type,
        booking_type: 'scheduled',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'bathroom_cleaning' ? null : flatSize,
        family_count: null,
        food_pref: null,
        cook_cuisine_pref: null,
        cook_gender_pref: null,
        maid_tasks: service_type === 'maid' && tasksParam ? tasksParam.split(',') as ('floor_cleaning' | 'dish_washing')[] : null,
        dish_intensity: service_type === 'maid' && dishIntensity ? dishIntensity : null,
        dish_intensity_extra_inr: service_type === 'maid' && dishIntensityExtra > 0 ? dishIntensityExtra : null,
        bathroom_count: service_type === 'bathroom_cleaning' ? parseInt(bathroomCount!) : null,
        has_glass_partition: service_type === 'bathroom_cleaning' ? hasGlassPartition : null,
        glass_partition_fee: service_type === 'bathroom_cleaning' && hasGlassPartition 
          ? GLASS_PARTITION_FEE * parseInt(bathroomCount!) 
          : null,
        price_inr: finalPrice,
        surcharge_amount: surcharge,
        surcharge_reason: surcharge > 0 ? 'slot_surge' : null,
        cust_name: /^\+?\d{7,15}$/.test(profile.full_name.trim()) ? 'User ' + profile.phone.slice(-4) : profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
        payment_method: paymentMethod === 'pay_after_service' ? 'pay_after_service' : null,
        payment_status: paymentMethod === 'pay_after_service' ? 'pay_after_service' : 'pending',
      };

      console.log('📤 Sending scheduled booking to database:', bookingData);

      const { data, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select();

      if (error) {
        console.error('❌ Scheduled booking error:', error);
        const isFlatError = error.message?.includes('flat details');
        const isSlotError = error.message?.includes('Slot unavailable') || error.message?.includes('Not enough workers');
        toast({
          title: isSlotError ? "Slot unavailable" : "Booking Failed",
          description: isFlatError
            ? "Please update your flat details in Account Settings before booking."
            : isSlotError
            ? "No workers are available at this time. Please choose another time slot."
            : `Error: ${error.message || 'Please try again.'}`,
          variant: "destructive"
        });
        if (isFlatError) navigate('/profile/settings');
        return;
      }

      console.log('✅ Scheduled booking created successfully:', data);

      const newBookingId = data?.[0]?.id;
      if (!newBookingId) {
        toast({ title: "Booking Failed", description: "No booking ID returned.", variant: "destructive" });
        return;
      }

      trackPaymentEvent('booking_created', { booking_id: newBookingId, user_id: profile.id });

      // Pay After Service: skip payment, go straight to bookings
      if (paymentMethod === 'pay_after_service') {
        toast({
          title: "Booking scheduled!",
          description: "Worker will be assigned before the scheduled time. Pay after service is done."
        });
        navigate('/bookings');
        return;
      }

      // Pay Now: Execute payment flow
      try {
        await executePaymentFlow(newBookingId, (status) => {
          setPaymentStatus(status);
        });

        toast({
          title: "Payment successful!",
          description: "Your booking has been scheduled and paid. Worker will be assigned before the scheduled time."
        });
        navigate('/bookings');
      } catch (payErr: any) {
        console.error('❌ Payment error:', payErr);
        const errType = payErr instanceof PaymentError ? payErr.type : 'payment_failed';
        setRetryErrorType(errType as PaymentErrorType);
        setRetryErrorMessage(payErr?.message);
        setRetryBookingId(newBookingId);
        setRetryBookingCreatedAt(new Date().toISOString());
        setRetrySheetOpen(true);
      }
    } catch (err: any) {
      console.error('Booking error:', err);
      const isNetworkError = err?.message?.includes('Load failed') || err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError');
      toast({
        title: "Booking Failed",
        description: isNetworkError
          ? "Network error – please check your internet connection and try again."
          : `Error: ${err?.message || 'Please try again.'}`,
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
      setPaymentStatus(null);
    }
  };

  if (!user || !service_type || !isValidServiceType(service_type)) {
    return null;
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-6">
            <Skeleton className="h-14 w-full rounded-3xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (service_type !== 'bathroom_cleaning' && !flatSize) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/book/${service_type}`)} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold text-foreground ml-4">
              Schedule {prettyServiceName(service_type)}
            </h1>
          </div>
          
          <Card className="bg-yellow-50 border-yellow-200 rounded-2xl">
            <CardContent className="p-4">
              <p className="text-yellow-800 font-medium">
                {service_type === 'bathroom_cleaning'
                  ? 'Select bathroom count first'
                  : 'Select flat size first'}
              </p>
              <Button 
                variant="link" 
                onClick={() => navigate(`/book/${service_type}`)}
                className="text-yellow-600 p-0 h-auto"
              >
                Go back to booking form
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const dateChips = getDateChips();
  const timeSegments = TIME_SEGMENTS;
  const currentSegmentSlots = makeSlots(
    timeSegments[activeSegment].start,
    timeSegments[activeSegment].end
  );

  const canConfirm = selectedDate && selectedTime && !submitting;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-3 py-4 pb-28">
        {/* Header */}
        <div className="flex items-center mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/book/${service_type}`)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground ml-2">
            Schedule {prettyServiceName(service_type)}
          </h1>
        </div>

        <div className="space-y-4">
          {/* Date Selection */}
          <Card className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <h2 className="text-base font-semibold text-foreground mb-3">
              Select date of service
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {dateChips.slice(0, 4).map((chip, index) => (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => {
                    setSelectedDate(chip.date);
                    setSelectedTime(''); // Reset time when date changes
                  }}
                  className={`rounded-xl px-3 py-4 h-auto border-2 whitespace-nowrap flex-shrink-0 flex flex-col items-center gap-0.5 min-w-[70px] ${
                    selectedDate.toDateString() === chip.date.toDateString()
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="text-xs font-semibold">{chip.label}</span>
                  <span className="text-lg font-bold">{chip.dayLabel}</span>
                </Button>
              ))}
            </div>
          </Card>

          {/* Time Selection */}
          <Card className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <h2 className="text-base font-semibold text-foreground mb-3">
              Select start time of service
            </h2>
            
            <Tabs value={activeSegment} onValueChange={(value) => {
              setActiveSegment(value as TimeSegment);
              setSelectedTime(''); // Reset time when segment changes
            }}>
              <TabsList className="grid w-full grid-cols-3 mb-3 bg-gray-100 rounded-xl p-0.5 h-9">
                <TabsTrigger value="Morning" className="rounded-lg text-xs">Morning</TabsTrigger>
                <TabsTrigger value="Afternoon" className="rounded-lg text-xs">Afternoon</TabsTrigger>
                <TabsTrigger value="Evening" className="rounded-lg text-xs">Evening</TabsTrigger>
              </TabsList>

              <TabsContent value={activeSegment} className="mt-0">
                <div className="grid grid-cols-3 gap-2">
                  {currentSegmentSlots.map((slot) => {
                    const isPast = isPastToday(slot, selectedDate);
                    const isSelected = selectedTime === slot;
                    const slotSurge = getSurge(slot);
                    const isSlotUnavailable = unavailableSlots.has(slot);
                    const isDisabled = isPast || isSlotUnavailable;
                    
                    return (
                      <Button
                        key={slot}
                        variant="outline"
                        disabled={isDisabled}
                        onClick={() => {
                          setSelectedTime(slot);
                          if (isLimitedAvailabilitySlot(slot)) {
                            setShowAvailabilityWarning(true);
                          }
                        }}
                        className={`relative rounded-xl border-2 h-auto min-h-[3rem] px-2 text-xs flex flex-col items-center justify-center py-1.5 ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : isDisabled
                            ? 'border-gray-200 text-gray-400 bg-gray-50 opacity-50'
                            : 'border-gray-200 bg-white text-foreground hover:border-primary/50'
                        }`}
                      >
                        <span className={`font-medium ${isSlotUnavailable ? 'line-through' : ''}`}>{toDisplay12h(slot)}</span>
                        {isSlotUnavailable && !isPast && (
                          <span className="text-[9px] text-destructive font-normal">Unavailable</span>
                        )}
                        {!isSlotUnavailable && slotSurge > 0 && (
                          <span className={`text-[10px] font-semibold mt-0.5 ${
                            isSelected ? 'text-primary' : 'text-orange-500'
                          }`}>
                            +₹{slotSurge}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Price Summary - Always shown when price available */}
        {price !== null && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-2xl border border-primary/20">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Base price</span>
                </div>
                <span className="text-sm font-semibold text-foreground">₹{price}</span>
              </div>

              {selectedTime && getSurge(selectedTime) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-orange-600">Slot surge</span>
                  <span className="text-xs font-semibold text-orange-600">+₹{getSurge(selectedTime)}</span>
                </div>
              )}


              <div className="border-t border-primary/20 pt-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-xl font-bold text-foreground">
                  ₹{price + (selectedTime ? getSurge(selectedTime) : 0)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Button */}
        <div className="mt-4">
          <Button
            onClick={() => setShowPaymentPicker(true)}
            disabled={!canConfirm}
            className="w-full h-12 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] text-white font-semibold text-sm disabled:opacity-50"
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>
                  {paymentStatus === 'debiting_wallet' && 'Using wallet...'}
                  {paymentStatus === 'creating_order' && 'Creating order...'}
                  {paymentStatus === 'opening_checkout' && 'Opening payment...'}
                  {paymentStatus === 'verifying_payment' && 'Verifying payment...'}
                  {paymentStatus === 'verification_pending' && 'Verifying payment, please wait...'}
                  {(!paymentStatus || paymentStatus === 'payment_success') && 'Processing...'}
                </span>
              </div>
            ) : (
              `Confirm Schedule${price ? ` · ₹${price + (selectedTime ? getSurge(selectedTime) : 0)}` : ''}`
            )}
          </Button>
        </div>

        {/* Payment Method Popup */}
        <AlertDialog open={showPaymentPicker} onOpenChange={setShowPaymentPicker}>
          <AlertDialogContent className="max-w-sm rounded-2xl p-5">
            <AlertDialogHeader className="pb-1">
              <AlertDialogTitle className="text-base font-bold text-center">
                Complete your booking
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground text-center">
                Choose how you'd like to pay
              </AlertDialogDescription>
            </AlertDialogHeader>
            <PaymentMethodSelector
              selected={paymentMethod}
              onChange={setPaymentMethod}
              disabled={submitting}
              walletBalance={walletBalance}
              bookingAmount={price ? price + (selectedTime ? getSurge(selectedTime) : 0) : 0}
            />
            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                onClick={() => setShowPaymentPicker(false)}
                className="flex-1 rounded-xl h-11"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowPaymentPicker(false);
                  handleConfirmSchedule();
                }}
                disabled={submitting}
                className="flex-1 rounded-xl h-11 font-bold"
              >
                {paymentMethod === 'pay_after_service' ? 'Confirm Booking' : 'Pay securely'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* Limited Availability Warning Dialog */}
        <AlertDialog open={showAvailabilityWarning} onOpenChange={setShowAvailabilityWarning}>
          <AlertDialogContent className="max-w-sm rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-foreground">
                Note
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground space-y-2">
                <p>
                  Availability is limited between 3 PM – 7 PM.
                </p>
                <p className="font-medium text-foreground">
                  Book before 3 PM for guaranteed worker assignment.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction className="w-full rounded-full bg-primary">
                Agree & Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Payment Retry Sheet */}
        <PaymentRetrySheet
          open={retrySheetOpen}
          onOpenChange={setRetrySheetOpen}
          errorType={retryErrorType}
          errorMessage={retryErrorMessage}
          bookingCreatedAt={retryBookingCreatedAt}
          retrying={retrying}
          onRetry={async () => {
            if (!retryBookingId || retrying) return;
            setRetrying(true);
            try {
              await executePaymentFlow(retryBookingId, setPaymentStatus);
              setRetrySheetOpen(false);
              toast({ title: "Payment successful!", description: "Your scheduled booking is confirmed." });
              navigate('/bookings');
            } catch (err: any) {
              const errType = err instanceof PaymentError ? err.type : 'payment_failed';
              setRetryErrorType(errType as PaymentErrorType);
              setRetryErrorMessage(err?.message);
            } finally {
              setRetrying(false);
            }
          }}
          onPayAfterService={async () => {
            if (!retryBookingId) return;
            await supabase.from('bookings').update({ payment_method: 'pay_after_service', payment_status: 'pay_after_service' }).eq('id', retryBookingId);
            setRetrySheetOpen(false);
            toast({ title: "Booking scheduled!", description: "Pay after service is done." });
            navigate('/bookings');
          }}
          onVerificationResolved={() => {
            setRetrySheetOpen(false);
            toast({ title: "Payment being verified", description: "Your booking will update automatically." });
            navigate('/bookings');
          }}
        />
      </div>
    </div>
  );
}