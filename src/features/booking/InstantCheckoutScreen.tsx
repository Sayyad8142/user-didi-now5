import React, { useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, Search, X, Zap, Check, Users, Sparkles } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { prettyServiceName } from './pricing';
import { useFlatSize } from '@/hooks/useFlatSize';
import { useFavoriteWorkers, type FavoriteWorker } from '@/hooks/useFavoriteWorkers';
import { checkInstantBookingAvailability } from '@/hooks/useSupplyCheck';
import { SupplyFullModal } from '@/components/SupplyFullModal';
import { executePaymentFlow, executePaymentFirstFlow, PaymentError, type PaymentFlowStatus, type PaymentErrorType } from '@/lib/paymentService';
import { PaymentMethodSelector, type PaymentMethod } from '@/components/PaymentMethodSelector';
import { PaymentRetrySheet } from '@/components/PaymentRetrySheet';
import { trackPaymentEvent } from '@/lib/paymentAnalytics';
import { useWalletBalance } from '@/hooks/useWallet';

export function InstantCheckoutScreen() {
  const navigate = useNavigate();
  const { service_type } = useParams<{ service_type: string }>();
  const [searchParams] = useSearchParams();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentFlowStatus | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_after_service');
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  // Retry state
  const [retrySheetOpen, setRetrySheetOpen] = useState(false);
  const [retryErrorType, setRetryErrorType] = useState<PaymentErrorType>('payment_failed');
  const [retryErrorMessage, setRetryErrorMessage] = useState<string | undefined>();
  const [retryBookingId, setRetryBookingId] = useState<string | null>(null);
  const [retryBookingData, setRetryBookingData] = useState<Record<string, any> | null>(null);
  const [retryBookingCreatedAt, setRetryBookingCreatedAt] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { flatSize: autoFlatSize } = useFlatSize();
  const { data: walletData } = useWalletBalance();
  const walletBalance = walletData?.balance_inr ?? 0;

  const priceParam = searchParams.get('price');
  const price = priceParam ? Number(priceParam) : 0;
  const tasks = searchParams.get('tasks');
  const dishIntensity = searchParams.get('dish_intensity');
  const dishExtra = searchParams.get('dish_extra');
  const bathroomCount = searchParams.get('bathrooms');
  const hasGlass = searchParams.get('glass') === '1';

  const [selectedWorker, setSelectedWorker] = useState<FavoriteWorker | null>(null);

  const { data: workers, isLoading } = useFavoriteWorkers(service_type, profile?.community);

  const filtered = (workers || []).filter((w) =>
    w.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (worker: FavoriteWorker) => {
    if (!worker.is_online) {
      toast({
        title: 'Expert is offline',
        description: 'This expert is offline right now. Try another or book without preference.',
      });
      return;
    }
    if (selectedWorker?.worker_id === worker.worker_id) {
      setSelectedWorker(null);
    } else {
      setSelectedWorker(worker);
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedWorker(null);
  }, []);

  const handleBookNow = () => {
    setShowPaymentPicker(true);
  };

  const confirmBooking = async () => {
    setShowPaymentPicker(false);
    if (!profile || !service_type || !user) return;

    // Server-side supply check
    if (profile.community) {
      const available = await checkInstantBookingAvailability(profile.community);
      if (!available) {
        setSupplyModalOpen(true);
        return;
      }
    }

    if (!profile.community || profile.community === 'other') {
      toast({
        title: "Profile Incomplete",
        description: "Please complete your profile with community information before booking.",
        variant: "destructive"
      });
      navigate('/profile/settings');
      return;
    }

    if (service_type !== 'bathroom_cleaning' && !profile.flat_id) {
      toast({
        title: "Flat Details Missing",
        description: "Please update your flat details in Account Settings before booking.",
        variant: "destructive"
      });
      navigate('/profile/settings');
      return;
    }

    setSubmitting(true);
    setPaymentStatus(null);
    try {
      const maidTasks = tasks ? tasks.split(',') : null;
      const bookingData = {
        user_id: profile.id,
        service_type,
        booking_type: 'instant',
        scheduled_date: null,
        scheduled_time: null,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'bathroom_cleaning' ? null : autoFlatSize,
        price_inr: price,
        family_count: null,
        food_pref: null,
        cook_cuisine_pref: null,
        cook_gender_pref: null,
        maid_tasks: service_type === 'maid' ? maidTasks : null,
        dish_intensity: service_type === 'maid' && maidTasks?.includes('dish_washing') ? dishIntensity : null,
        dish_intensity_extra_inr: service_type === 'maid' && maidTasks?.includes('dish_washing') && dishExtra ? Number(dishExtra) : null,
        bathroom_count: service_type === 'bathroom_cleaning' && bathroomCount ? Number(bathroomCount) : null,
        has_glass_partition: service_type === 'bathroom_cleaning' ? hasGlass : null,
        glass_partition_fee: service_type === 'bathroom_cleaning' && hasGlass && bathroomCount ? 30 * Number(bathroomCount) : null,
        cust_name: /^\+?\d{7,15}$/.test(profile.full_name.trim()) ? 'User ' + profile.phone.slice(-4) : profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
        preferred_worker_id: selectedWorker?.worker_id || null,
        payment_method: paymentMethod === 'pay_after_service' ? 'pay_after_service' : null,
        payment_status: paymentMethod === 'pay_after_service' ? 'pay_after_service' : 'pending',
      } as any;

      const { data, error } = await supabase.from('bookings').insert([bookingData]).select();

      if (error) {
        console.error('❌ Booking error:', error);
        if (error.message?.includes('SUPPLY_FULL')) {
          setSupplyModalOpen(true);
          return;
        }
        const isFlatError = error.message?.includes('flat details');
        toast({
          title: "Booking Failed",
          description: isFlatError
            ? "Please update your flat details in Account Settings before booking."
            : `Error: ${error.message || 'Please try again.'}`,
          variant: "destructive"
        });
        if (isFlatError) navigate('/profile/settings');
        return;
      }

      const newBookingId = data?.[0]?.id;
      if (!newBookingId) {
        toast({ title: "Booking Failed", description: "No booking ID returned.", variant: "destructive" });
        return;
      }

      trackPaymentEvent('booking_created', { booking_id: newBookingId, user_id: profile.id, amount: price });

      // Pay After Service: skip payment, go straight to bookings
      if (paymentMethod === 'pay_after_service') {
        sessionStorage.removeItem(`preferred_worker_${service_type}`);
        toast({
          title: "Booking confirmed!",
          description: "Worker will arrive in ~10 minutes. Pay after service is done."
        });
        navigate('/bookings');
        return;
      }

      // Pay Now: Execute payment flow
      try {
        await executePaymentFlow(newBookingId, (status) => {
          setPaymentStatus(status);
        });

        sessionStorage.removeItem(`preferred_worker_${service_type}`);
        toast({
          title: "Payment successful!",
          description: "Your booking is confirmed. Worker will arrive in ~10 minutes."
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
      console.error('❌ Booking error:', err);
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

  const serviceName = service_type ? prettyServiceName(service_type) : 'Service';

  return (
    <div className="min-h-screen bg-background pb-44">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Instant Booking</h1>
            <p className="text-[11px] text-muted-foreground">{serviceName} • arrives in ~10 min</p>
          </div>
        </div>

        {/* Expert Selection Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="px-4 pt-4 pb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-bold text-foreground leading-tight">
                  Your previous experts
                </h3>
                <p className="text-[10px] text-muted-foreground">Optional • Priority booking</p>
              </div>
            </div>
            {selectedWorker && (
              <button onClick={clearSelection} className="text-[11px] text-primary font-semibold px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Selected worker banner */}
          {selectedWorker && (
            <div className="mx-4 mb-3 flex items-center gap-2.5 bg-primary/5 border border-primary/15 rounded-xl px-3 py-2">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <p className="text-[11px] text-foreground">
                <span className="font-bold">{selectedWorker.full_name}</span>
                <span className="text-muted-foreground"> gets first priority</span>
              </p>
            </div>
          )}

          {/* Search */}
          {(workers?.length || 0) > 3 && (
            <div className="px-4 mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-xl h-8 text-xs bg-muted/50 border-0 focus-visible:ring-1"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Workers list */}
          <div className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-6 px-2">
                <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium text-xs">
                  {search ? 'No match found' : 'No previous experts yet'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {search ? 'Try a different name.' : 'Book once to see your favorite experts here.'}
                </p>
                {!search && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs rounded-xl"
                    onClick={handleBookNow}
                    disabled={submitting}
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    Book instantly
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((w) => {
                  const isSelected = selectedWorker?.worker_id === w.worker_id;
                  const isOnline = w.is_online;
                  return (
                    <button
                      key={w.worker_id}
                      onClick={() => handleSelect(w)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200",
                        isSelected
                          ? "bg-primary/8 ring-[1.5px] ring-primary"
                          : isOnline
                            ? "hover:bg-muted/40 active:scale-[0.98]"
                            : "opacity-60 cursor-default"
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className={cn(
                          "rounded-full p-[2px] transition-all",
                          isSelected ? "bg-gradient-to-br from-primary to-primary/60" : "bg-transparent"
                        )}>
                          <Avatar className={cn(
                            "w-11 h-11 border-2 transition-all",
                            isSelected ? "border-background" : "border-border"
                          )}>
                            {w.photo_url ? <AvatarImage src={w.photo_url} alt={w.full_name} /> : null}
                            <AvatarFallback className={cn(
                              "font-bold text-sm transition-colors",
                              isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              {w.full_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        {/* Online/Offline dot */}
                        <span className={cn(
                          "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-[2px] border-background",
                          isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                        )} />
                        {isSelected && (
                          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                            <Check className="w-2.5 h-2.5 text-primary-foreground stroke-[3]" />
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-left">
                        <p className={cn(
                          "text-[13px] leading-tight truncate",
                          isSelected ? "font-bold text-primary" : "font-medium text-foreground"
                        )}>
                          {w.full_name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span className="text-[11px] font-semibold text-foreground">{Number(w.rating_avg).toFixed(1)}</span>
                          <span className="text-[10px] text-muted-foreground">· {w.completed_bookings_count} bookings</span>
                        </div>
                        <span className={cn(
                          "inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          isOnline
                            ? "text-emerald-600 bg-emerald-50"
                            : "text-muted-foreground bg-muted/60"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                          )} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>

                      {/* Selection indicator */}
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                        isSelected ? "border-primary bg-primary" : isOnline ? "border-muted-foreground/30" : "border-muted-foreground/20"
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card footer hint */}
          {!isLoading && filtered.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2 bg-muted/20">
              <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" />
                Skip selection to auto-match with the best expert
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom Book Now bar */}
      <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        <div className="max-w-md mx-auto px-4 pointer-events-auto">
          <div className="mb-[76px] pb-safe">
            <Button
              onClick={handleBookNow}
              disabled={submitting}
              className="w-full h-12 rounded-2xl text-base font-bold shadow-lg"
              size="lg"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
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
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Book Now{price ? ` · ₹${price}` : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Payment Method Picker Dialog */}
      <AlertDialog open={showPaymentPicker} onOpenChange={setShowPaymentPicker}>
        <AlertDialogContent className="max-w-sm rounded-2xl p-5">
          <AlertDialogHeader className="pb-1">
            <AlertDialogTitle className="text-base font-bold text-center">Complete your booking</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground text-center">
              Choose how you'd like to pay
            </AlertDialogDescription>
          </AlertDialogHeader>
          <PaymentMethodSelector
            selected={paymentMethod}
            onChange={setPaymentMethod}
            walletBalance={walletBalance}
            bookingAmount={price}
          />
          <div className="flex gap-2 mt-3">
            <AlertDialogCancel className="flex-1 rounded-xl h-11">Cancel</AlertDialogCancel>
            <Button className="flex-1 rounded-xl h-11 font-bold" onClick={confirmBooking} disabled={submitting}>
              {paymentMethod === 'pay_after_service'
                ? 'Confirm Booking'
                : walletBalance >= price
                  ? `Pay ₹${price} securely`
                  : `Pay ₹${price} securely`}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supply Full Modal */}
      <SupplyFullModal
        open={supplyModalOpen}
        onClose={() => setSupplyModalOpen(false)}
        onSchedule={() => {
          setSupplyModalOpen(false);
          navigate(`/book/${service_type}/schedule`);
        }}
      />

      {/* Payment Retry Sheet */}
      <PaymentRetrySheet
        open={retrySheetOpen}
        onOpenChange={async (open) => {
          setRetrySheetOpen(open);
          if (!open && retryBookingId) {
            console.log('🗑️ Cancelling unpaid booking on retry dismiss:', retryBookingId);
            await supabase.from('bookings').update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: 'user',
              cancellation_reason: 'payment_not_completed',
              cancel_source: 'user',
              cancel_reason: 'Payment not completed',
            }).eq('id', retryBookingId).eq('payment_status', 'pending');
            setRetryBookingId(null);
          }
        }}
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
            sessionStorage.removeItem(`preferred_worker_${service_type}`);
            toast({ title: "Payment successful!", description: "Your booking is confirmed." });
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
          toast({ title: "Booking confirmed!", description: "Pay after service is done." });
          navigate('/bookings');
        }}
        onVerificationResolved={() => {
          setRetrySheetOpen(false);
          toast({ title: "Payment being verified", description: "Your booking will update automatically." });
          navigate('/bookings');
        }}
      />
    </div>
  );
}
