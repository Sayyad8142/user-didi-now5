import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadRazorpayScript } from '@/lib/razorpay';
import { payIntentWithWalletThenRazorpay, payWithWalletThenRazorpay } from '@/lib/walletPayment';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Home, Clock, Calendar, AlertCircle, Check, Zap, ChevronRight, Star, X, Ruler, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import { prettyServiceName, serviceIcon, isValidServiceType, getPricingMap, FLAT_SIZES, type FlatSize, type PricingMap } from './pricing';
import { isOpenNow, getOpenStatusText, getServiceHoursText } from '@/features/home/time';
import { ScheduleSheet } from './ScheduleSheet';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PriceNote } from '@/components/PriceNote';
import { isGuestMode } from '@/lib/demo';
import { useInstantBookingAvailability } from '@/hooks/useInstantBookingAvailability';
import { useSupplyCheck, checkInstantBookingAvailability } from '@/hooks/useSupplyCheck';
import { SupplyFullModal } from '@/components/SupplyFullModal';
import { PaymentChoiceSheet } from '@/components/PaymentChoiceSheet';
import { type DishIntensity } from './DishIntensitySheet';
import { useDishIntensityPricing } from '@/hooks/useDishIntensityPricing';
import { useFlatSize } from '@/hooks/useFlatSize';
import { MaidPriceChartSheet } from './MaidPriceChartSheet';

// Maid task types and constants
type MaidTask = "floor_cleaning" | "dish_washing";
const TASK_LABEL: Record<MaidTask, string> = {
  floor_cleaning: "Jhaadu & Pocha (Floor Cleaning)",
  dish_washing: "Dish Washing"
};
// Fallback base prices if table not found
const FALLBACK_PRICES: Record<string, number> = {
  "2BHK": 100,
  "2.5BHK": 110,
  "3BHK": 120,
  "3.5BHK": 130,
  "4BHK": 150
};
export function BookingForm() {
  const {
    service_type
  } = useParams<{
    service_type: string;
  }>();
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const {
    profile,
    loading: profileLoading,
    refresh: refreshProfile
  } = useProfile();
  const {
    toast
  } = useToast();
  // Flat size from flats table (admin-managed, not user-selectable)
  const { flatSize: autoFlatSize, loading: flatSizeLoading, error: flatSizeError } = useFlatSize();
  const selectedFlatSize = autoFlatSize as FlatSize | null;
  const [pricingMap, setPricingMap] = useState<PricingMap>({});
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [priceChartOpen, setPriceChartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Check instant booking availability (must be before any early returns)
  const { isAvailable: instantAvailable, isError: instantError, isLoading: instantLoading } = useInstantBookingAvailability(service_type || '');
  const instantDisabled = !instantLoading && (!instantAvailable || instantError);

  // Supply protection: max 3 pending instant bookings per community
  const { isSupplyFull, refetch: refetchSupply } = useSupplyCheck(profile?.community);
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [paymentChoiceOpen, setPaymentChoiceOpen] = useState(false);

  // Combined instant disabled state
  const instantBlocked = instantDisabled || isSupplyFull;

  // Maid service specific state
  const [selectedTasks, setSelectedTasks] = useState<MaidTask[]>([]); // User selects manually
  const [dishIntensity, setDishIntensity] = useState<DishIntensity | null>('light');
  const [dishError, setDishError] = useState(false);
  const [dishHighlight, setDishHighlight] = useState(false);
  const dishSectionRef = useRef<HTMLDivElement>(null);

  // Bathroom cleaning specific state
  const [bathroomCount, setBathroomCount] = useState(1);
  const [hasGlassPartition, setHasGlassPartition] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const GLASS_PARTITION_FEE = 30; // ₹30 per bathroom

  // Preferred worker state
  type PreferredWorker = {id: string;full_name: string;photo_url: string | null;rating_avg: number;};
  const prefKey = `preferred_worker_${service_type}`;
  const [preferredWorker, setPreferredWorker] = useState<PreferredWorker | null>(() => {
    try {
      const stored = sessionStorage.getItem(prefKey);
      return stored ? JSON.parse(stored) : null;
    } catch {return null;}
  });

  // Listen for returning from select-worker screen
  useEffect(() => {
    const handleFocus = () => {
      try {
        const stored = sessionStorage.getItem(prefKey);
        if (stored) setPreferredWorker(JSON.parse(stored));else
        setPreferredWorker(null);
      } catch {/* ignore */}
    };
    window.addEventListener('focus', handleFocus);
    // Also check on mount / navigation return
    handleFocus();
    return () => window.removeEventListener('focus', handleFocus);
  }, [prefKey]);

  const clearPreferredWorker = useCallback(() => {
    sessionStorage.removeItem(prefKey);
    setPreferredWorker(null);
  }, [prefKey]);

  // Fetch maid task prices
  const {
    data: taskPrices
  } = useQuery({
    queryKey: ["maid_prices", selectedFlatSize, profile?.community],
    enabled: !!selectedFlatSize && service_type === 'maid',
    queryFn: async () => {
      const q = supabase.from("maid_pricing_tasks").select("task, price_inr, community").eq("flat_size", selectedFlatSize!).eq("active", true);
      if (profile?.community) {
        q.or(`community.is.null,community.eq.,community.eq.${profile.community}`);
      } else {
        q.or(`community.is.null,community.eq.`);
      }
      const {
        data,
        error
      } = await q;
      if (error) throw error;

      // Build pricing map with community-specific overriding global
      const map = new Map<MaidTask, number>();

      // First, add global pricing (where community is null)
      (data || []).filter((row) => row.community === null).forEach((row: any) => {
        map.set(row.task, row.price_inr);
      });

      // Then, override with community-specific pricing if available
      if (profile?.community) {
        (data || []).filter((row) => row.community === profile.community).forEach((row: any) => {
          map.set(row.task, row.price_inr);
        });
      }

      // Ensure both tasks have prices (fallback)
      (["floor_cleaning", "dish_washing"] as MaidTask[]).forEach((t) => {
        if (!map.has(t)) {
          map.set(t, FALLBACK_PRICES[selectedFlatSize] || 100);
        }
      });
      return map;
    }
  });

  // Fetch bathroom unit price
  const { data: bathroomUnitPrice } = useQuery({
    queryKey: ["bathroom_unit_price", profile?.community],
    enabled: service_type === 'bathroom_cleaning',
    queryFn: async () => {
      // exact community first
      const { data: specific } = await supabase.
      from("bathroom_pricing_settings").
      select("unit_price_inr").
      eq("community", profile?.community || "").
      maybeSingle();
      if (specific) return specific.unit_price_inr;

      // global fallback
      const { data: global } = await supabase.
      from("bathroom_pricing_settings").
      select("unit_price_inr").
      eq("community", "").
      maybeSingle();
      return global?.unit_price_inr ?? 250;
    }
  });

  // Fetch dish intensity pricing from DB
  const { data: dishIntensityPrices } = useDishIntensityPricing(profile?.community);
  const getIntensityExtra = (i: DishIntensity): number => {
    const found = dishIntensityPrices?.find(p => p.intensity === i);
    return found?.extra_inr ?? 0;
  };

  // Helper functions for maid pricing
  const taskPrice = (t: MaidTask) => taskPrices?.get(t) ?? FALLBACK_PRICES[selectedFlatSize || "2BHK"];
  const dishIntensityExtra = selectedTasks.includes('dish_washing') && dishIntensity ? getIntensityExtra(dishIntensity) : 0;
  const totalPrice = service_type === 'maid' && selectedTasks.length > 0 ?
  selectedTasks.reduce((sum, task) => sum + taskPrice(task), 0) + dishIntensityExtra :
  0;

  // Bathroom pricing calculation
  const bathroomBasePrice = service_type === 'bathroom_cleaning' ? (bathroomUnitPrice ?? 250) * Math.max(1, bathroomCount) : 0;
  const glassPartitionFee = service_type === 'bathroom_cleaning' && hasGlassPartition ? GLASS_PARTITION_FEE * Math.max(1, bathroomCount) : 0;
  const bathroomTotalPrice = bathroomBasePrice + glassPartitionFee;
  useEffect(() => {
    // Don't redirect - ProtectedRoute handles auth check
    if (service_type && !isValidServiceType(service_type)) {
      navigate('/home');
      return;
    }
    // If profile is not loaded yet but we have a user, trigger a refresh
    if (user && !profileLoading && !profile) {
      refreshProfile();
    }
  }, [user, service_type, navigate, profile, profileLoading, refreshProfile]);
  useEffect(() => {
    if (profile && service_type && service_type !== 'maid' && service_type !== 'bathroom_cleaning') {
      loadPricing();
    } else if (service_type === 'maid' || service_type === 'bathroom_cleaning') {
      setLoadingPricing(false);
    }
  }, [profile, service_type]);

  // Auto-scroll + highlight dish section when dish_washing is selected
  useEffect(() => {
    if (!selectedTasks.includes('dish_washing') || dishIntensity) return;
    const timer = setTimeout(() => {
      setDishHighlight(true);
      dishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setDishHighlight(false), 2500);
    }, 1500);
    return () => clearTimeout(timer);
  }, [selectedTasks, dishIntensity]);

  // Clear error when user selects intensity
  useEffect(() => {
    if (dishIntensity) setDishError(false);
  }, [dishIntensity]);
  const loadPricing = async () => {
    if (!service_type || !profile) return;
    setLoadingPricing(true);
    try {
      const pricing = await getPricingMap(service_type, profile.community);
      setPricingMap(pricing);
    } catch (error) {
      console.error('Error loading pricing:', error);
      toast({
        title: "Error",
        description: "Failed to load pricing information.",
        variant: "destructive"
      });
    } finally {
      setLoadingPricing(false);
    }
  };
  const handleBookNow = async () => {
    if (!profile || !service_type) return;

    // Server-side supply check before creating booking
    if (profile.community) {
      const available = await checkInstantBookingAvailability(profile.community);
      if (!available) {
        refetchSupply();
        setSupplyModalOpen(true);
        return;
      }
    }

    if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({
          title: "Cannot book yet",
          description: !selectedFlatSize ? "Flat size is not available. Please update your flat details." : "Select at least one task before booking.",
          variant: "destructive"
        });
        return;
      }
      // Validate dish intensity selection if dish washing is selected
      if (selectedTasks.includes('dish_washing') && !dishIntensity) {
        setDishError(true);
        setDishHighlight(true);
        dishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setDishHighlight(false), 2500);
        toast({
          title: "Select dish washing workload",
          description: "Please choose Light, Medium, or Heavy for dish washing.",
          variant: "destructive"
        });
        return;
      }
      await createBooking('instant', null, null, totalPrice);
    } else if (service_type === 'bathroom_cleaning') {
      await createBooking('instant', null, null, bathroomTotalPrice);
    } else {
      if (!selectedFlatSize) return;
      const price = pricingMap[selectedFlatSize];
      if (!price) {
        toast({
          title: "Error",
          description: "Price not available for selected flat size.",
          variant: "destructive"
        });
        return;
      }
      await createBooking('instant', null, null, price);
    }
  };

  // Get current price for instant booking
  const getInstantPrice = (): number => {
    if (service_type === 'maid') return totalPrice;
    if (service_type === 'bathroom_cleaning') return bathroomTotalPrice;
    if (selectedFlatSize) return pricingMap[selectedFlatSize] || 0;
    return 0;
  };

  const handlePayAfterService = async () => {
    if (!profile || !service_type) return;
    setPaymentChoiceOpen(false);

    const price = getInstantPrice();
    if (!price) return;

    if (service_type !== 'bathroom_cleaning' && !selectedFlatSize) return;

    if (!profile.community || profile.community === 'other') {
      toast({ title: "Profile Incomplete", description: "Please complete your profile with community information before booking.", variant: "destructive" });
      navigate('/profile/settings');
      return;
    }

    if (service_type !== 'bathroom_cleaning' && !profile.flat_id) {
      toast({ title: "Flat Details Missing", description: "Please update your flat details in Account Settings before booking.", variant: "destructive" });
      navigate('/profile/settings');
      return;
    }

    setSubmitting(true);
    try {
      const bookingData: Record<string, unknown> = {
        user_id: profile.id,
        service_type,
        booking_type: 'instant',
        scheduled_date: null,
        scheduled_time: null,
        notes: null,
        status: 'pending',
        payment_status: 'pay_after_service',
        payment_method: 'pay_after_service',
        flat_size: service_type === 'bathroom_cleaning' ? null : selectedFlatSize,
        price_inr: price,
        family_count: null,
        food_pref: null,
        cook_cuisine_pref: null,
        cook_gender_pref: null,
        maid_tasks: service_type === 'maid' ? selectedTasks : null,
        dish_intensity: service_type === 'maid' && selectedTasks.includes('dish_washing') ? dishIntensity : null,
        dish_intensity_extra_inr: service_type === 'maid' && selectedTasks.includes('dish_washing') ? dishIntensityExtra : null,
        bathroom_count: service_type === 'bathroom_cleaning' ? bathroomCount : null,
        has_glass_partition: service_type === 'bathroom_cleaning' ? hasGlassPartition : null,
        glass_partition_fee: service_type === 'bathroom_cleaning' ? glassPartitionFee : null,
        cust_name: /^\+?\d{7,15}$/.test(profile.full_name.trim()) ? 'User ' + profile.phone.slice(-4) : profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
        preferred_worker_id: null
      };

      const { data, error } = await supabase.from('bookings').insert([bookingData as any]).select();
      if (error) {
        if (error.message?.includes('SUPPLY_FULL')) { refetchSupply(); setSupplyModalOpen(true); return; }
        const isFlatError = error.message?.includes('flat details');
        toast({ title: "Booking Failed", description: isFlatError ? "Please update your flat details in Account Settings before booking." : `Error: ${error.message || 'Please try again.'}`, variant: "destructive" });
        if (isFlatError) navigate('/profile/settings');
        return;
      }

      toast({ title: "Booking Created! ✅", description: "Your service is booked. Pay after the service is done." });
      clearPreferredWorker();
      navigate('/home');
    } catch (err: any) {
      toast({ title: "Booking Failed", description: `Error: ${err?.message || 'Please try again.'}`, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleInstantClick = async () => {
    if (!profile || !service_type) return;

    // Server-side supply check before showing payment choice
    if (profile.community) {
      const available = await checkInstantBookingAvailability(profile.community);
      if (!available) {
        refetchSupply();
        setSupplyModalOpen(true);
        return;
      }
    }

    if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({ title: "Cannot book yet", description: !selectedFlatSize ? "Flat size not available. Update flat details." : "Select at least one task.", variant: "destructive" });
        return;
      }
      if (selectedTasks.includes('dish_washing') && !dishIntensity) {
        setDishError(true);
        setDishHighlight(true);
        dishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setDishHighlight(false), 2500);
        toast({ title: "Select dish washing workload", description: "Please choose Light, Medium, or Heavy.", variant: "destructive" });
        return;
      }
    } else if (service_type !== 'bathroom_cleaning') {
      if (!selectedFlatSize) return;
      const price = pricingMap[selectedFlatSize];
      if (!price) {
        toast({ title: "Error", description: "Price not available for selected flat size.", variant: "destructive" });
        return;
      }
    }

    // Show payment choice sheet
    setPaymentChoiceOpen(true);
  };

  const handlePayNowFromSheet = () => {
    setPaymentChoiceOpen(false);
    handleBookNow();
  };

  const handleSchedule = () => {
    if (!profile || !service_type) return;

    const params = new URLSearchParams();

    if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({ title: "Please complete maid booking details", description: "Select flat size and at least one task before scheduling.", variant: "destructive" });
        return;
      }
      if (selectedTasks.includes('dish_washing') && !dishIntensity) {
        toast({ title: "Select dish washing workload", description: "Please choose Light, Medium, or Heavy for dish washing.", variant: "destructive" });
        return;
      }
      params.set('flat', selectedFlatSize);
      params.set('price', totalPrice.toString());
    } else if (service_type === 'bathroom_cleaning') {
      params.set('bathrooms', bathroomCount.toString());
      params.set('glass', hasGlassPartition ? '1' : '0');
      params.set('price', bathroomTotalPrice.toString());
    } else {
      if (!selectedFlatSize) return;
      const price = pricingMap[selectedFlatSize];
      if (!price) {
        toast({ title: "Error", description: "Price not available for selected flat size.", variant: "destructive" });
        return;
      }
      params.set('flat', selectedFlatSize);
      params.set('price', price.toString());
    }

    navigate(`/schedule/${service_type}?${params.toString()}`);
  };
  const createBooking = async (bookingType: 'instant' | 'scheduled', scheduledDate: string | null, scheduledTime: string | null, price: number) => {
    if (service_type !== 'bathroom_cleaning' && !selectedFlatSize) return;

    if (!profile.community || profile.community === 'other') {
      toast({ title: "Profile Incomplete", description: "Please complete your profile with community information before booking.", variant: "destructive" });
      navigate('/profile/settings');
      return;
    }

    if (service_type !== 'bathroom_cleaning' && !profile.flat_id) {
      toast({ title: "Flat Details Missing", description: "Please update your flat details in Account Settings before booking.", variant: "destructive" });
      navigate('/profile/settings');
      return;
    }

    setSubmitting(true);
    try {
      await loadRazorpayScript();

      const bookingData: Record<string, unknown> = {
        user_id: profile.id,
        service_type,
        booking_type: bookingType,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
        payment_status: 'pending',
        flat_size: service_type === 'bathroom_cleaning' ? null : selectedFlatSize,
        price_inr: price,
        family_count: null,
        food_pref: null,
        cook_cuisine_pref: null,
        cook_gender_pref: null,
        maid_tasks: service_type === 'maid' ? selectedTasks : null,
        dish_intensity: service_type === 'maid' && selectedTasks.includes('dish_washing') ? dishIntensity : null,
        dish_intensity_extra_inr: service_type === 'maid' && selectedTasks.includes('dish_washing') ? dishIntensityExtra : null,
        bathroom_count: service_type === 'bathroom_cleaning' ? bathroomCount : null,
        has_glass_partition: service_type === 'bathroom_cleaning' ? hasGlassPartition : null,
        glass_partition_fee: service_type === 'bathroom_cleaning' ? glassPartitionFee : null,
        cust_name: /^\+?\d{7,15}$/.test(profile.full_name.trim()) ? 'User ' + profile.phone.slice(-4) : profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
        preferred_worker_id: null
      };

      if (bookingType === 'instant') {
        // INSTANT: Pay first, booking created server-side after payment
        console.log('🚀 Intent-based instant booking flow');
        const newBookingId = await payIntentWithWalletThenRazorpay(bookingData, profile.id, price);
        toast({ title: "Payment successful!", description: "Service will arrive in 10 minutes." });
        setScheduleSheetOpen(false);
        clearPreferredWorker();
        navigate('/home');
      } else {
        // SCHEDULED: Create booking first, then pay
        const { data, error } = await supabase.from('bookings').insert([bookingData as any]).select();
        if (error) {
          if (error.message?.includes('SUPPLY_FULL')) { refetchSupply(); setSupplyModalOpen(true); return; }
          const isFlatError = error.message?.includes('flat details');
          toast({ title: "Booking Failed", description: isFlatError ? "Please update your flat details in Account Settings before booking." : `Error: ${error.message || 'Please try again.'}`, variant: "destructive" });
          if (isFlatError) navigate('/profile/settings');
          return;
        }
        const newBookingId = data?.[0]?.id;
        if (!newBookingId) throw new Error("Booking created but no ID returned");

        try {
          await payWithWalletThenRazorpay(newBookingId, profile.id, data[0].price_inr || price);
          toast({ title: "Payment successful!", description: "Your booking has been scheduled successfully." });
          setScheduleSheetOpen(false);
          clearPreferredWorker();
          navigate('/home');
        } catch (payErr: any) {
          await supabase.from('bookings').update({ status: 'cancelled', cancel_reason: 'Payment not completed', cancel_source: 'user', cancelled_at: new Date().toISOString() }).eq('id', newBookingId);
          toast({ title: "Payment not completed", description: payErr.message === "Payment cancelled by user" ? "Booking cancelled. You can try again." : `Payment failed: ${payErr.message}`, variant: "destructive" });
        }
      }
    } catch (err: any) {
      const isPaymentCancel = err?.message === "Payment cancelled by user";
      const isNetworkError = err?.message?.includes('Load failed') || err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError');
      toast({
        title: isPaymentCancel ? "Payment not completed" : "Booking Failed",
        description: isPaymentCancel ? "You can try again anytime." : isNetworkError ? "Network error – please check your internet connection and try again." : `Error: ${err?.message || 'Please try again.'}`,
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };
  if (!user || !service_type || !isValidServiceType(service_type)) {
    return null;
  }
  // Show loading state if profile is still loading OR if we don't have profile data yet
  if (profileLoading || !profile) {
    return <div className="min-h-screen gradient-bg pb-24">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-6">
            <Skeleton className="h-14 w-full rounded-3xl bg-white/20" />
            <Skeleton className="h-36 w-full rounded-3xl bg-white/20" />
            <Skeleton className="h-52 w-full rounded-3xl bg-white/20" />
          </div>
        </div>
      </div>;
  }
  const ServiceIcon = serviceIcon(service_type);
  const currentPrice = service_type === 'maid' ? selectedFlatSize && selectedTasks.length > 0 ? totalPrice : null :
  service_type === 'bathroom_cleaning' ? bathroomTotalPrice :
  selectedFlatSize ? pricingMap[selectedFlatSize] : null;
  const isServiceOpen = isOpenNow(service_type);




  const canBook = isServiceOpen && !instantBlocked && !flatSizeLoading && !flatSizeError && (
  service_type === 'maid' ? selectedFlatSize && selectedTasks.length > 0 && (!selectedTasks.includes('dish_washing') || dishIntensity) && !submitting :
  service_type === 'bathroom_cleaning' ? !submitting :
  selectedFlatSize && currentPrice && !submitting);


  // Guest user check - show sign up prompt instead of booking form
  if (isGuestMode()) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-md mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold text-foreground ml-4">
              Book {prettyServiceName(service_type)}
            </h1>
          </div>

          {/* Guest Notice Card */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 rounded-3xl">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <ServiceIcon className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Create Account to Book Services
                </h2>
                <p className="text-muted-foreground text-lg">
                  To book our services, you need to create an account with your mobile number and community details.
                </p>
              </div>

              <div className="space-y-4">
                <Button
                  onClick={() => navigate('/auth')}
                  className="w-full h-16 rounded-2xl font-bold text-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">

                  Create Account & Book Now
                </Button>
                
                <Button
                  onClick={() => navigate('/home')}
                  variant="outline"
                  className="w-full h-14 rounded-2xl font-semibold border-primary/20 text-primary hover:bg-primary/5 transition-all duration-300">

                  Browse Services
                </Button>
              </div>

              <div className="mt-6 text-sm text-muted-foreground">
                <p>✓ Quick 30-second signup</p>
                <p>✓ Instant service booking</p>
                <p>✓ Track your orders</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>);

  }

  return <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-3 pb-6">
        {/* Header */}
        <div className="flex items-center mb-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground ml-4">
            Book {prettyServiceName(service_type)}
          </h1>
        </div>

        <div className="space-y-3">
          {/* Flat Size (read-only from flats table) */}
          {service_type !== 'bathroom_cleaning' &&
        <Card className="border border-border rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Ruler className="w-5 h-5 text-primary" />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-foreground font-medium">Flat Size</span>
                    {flatSizeLoading ?
                <Skeleton className="h-5 w-16 rounded" /> :
                selectedFlatSize ?
                <span className="text-foreground font-semibold">{selectedFlatSize}</span> :
                flatSizeError === 'no_flat_id' ?
                <span className="text-destructive text-sm font-medium">Update flat in Profile</span> :
                flatSizeError === 'no_flat_size' ?
                <span className="text-destructive text-sm font-medium">Contact support</span> :

                <span className="text-muted-foreground text-sm">Not available</span>
                }
                  </div>
                </div>
                {selectedFlatSize && service_type === 'maid' &&
            <button
              type="button"
              onClick={() => setPriceChartOpen(true)}
              className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline ml-8 mt-1.5">

                    See Price Chart
                    <ChevronDown className="w-3 h-3" />
                  </button>
            }
                {flatSizeError === 'no_flat_size' &&
            <p className="text-xs text-destructive mt-2 ml-8">
                    Flat size not configured for your flat. Please contact support to continue booking.
                  </p>
            }
                {flatSizeError === 'no_flat_id' &&
            <Button
              variant="link"
              className="text-xs text-primary p-0 h-auto ml-8 mt-1"
              onClick={() => navigate('/profile')}>

                    Update flat details →
                  </Button>
            }
              </CardContent>
            </Card>
        }

          {/* Bathroom Count Selector */}
          {service_type === 'bathroom_cleaning' && <div className="mt-8 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  How many bathrooms? <span className="text-destructive">*</span>
                </h2>
                
                {/* stepper */}
                <div className="flex items-center justify-center gap-4 mt-4">
                  <Button
                variant="outline"
                onClick={() => setBathroomCount((c) => Math.max(1, c - 1))}
                className="w-12 h-12 rounded-xl border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                disabled={bathroomCount <= 1}>

                    −
                  </Button>
                  <div className="min-w-12 text-center text-2xl font-bold text-foreground">{bathroomCount}</div>
                  <Button
                variant="outline"
                onClick={() => setBathroomCount((c) => Math.min(10, c + 1))}
                className="w-12 h-12 rounded-xl border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground">

                    +
                  </Button>
                </div>
              </div>

              {/* Glass Partition Selection */}
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  Glass Partition <span className="text-destructive">*</span>
                </h2>
                <div className="space-y-2">
                  {/* Without Glass Partition */}
                  <div
                onClick={() => setHasGlassPartition(false)}
                className={cn(
                  "relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200",
                  !hasGlassPartition ?
                  "border-primary bg-gradient-to-r from-primary/10 to-primary/5" :
                  "border-border bg-card hover:border-primary/50"
                )}>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      !hasGlassPartition ? "border-primary" : "border-muted-foreground"
                    )}>
                          {!hasGlassPartition && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="font-medium text-foreground">Without Glass Partition</span>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">₹0</span>
                    </div>
                  </div>

                  {/* With Glass Partition */}
                  <div
                onClick={() => setHasGlassPartition(true)}
                className={cn(
                  "relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200",
                  hasGlassPartition ?
                  "border-primary bg-gradient-to-r from-primary/10 to-primary/5" :
                  "border-border bg-card hover:border-primary/50"
                )}>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      hasGlassPartition ? "border-primary" : "border-muted-foreground"
                    )}>
                          {hasGlassPartition && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="font-medium text-foreground">With Glass Partition</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">+₹{GLASS_PARTITION_FEE}/bathroom</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>}

          {/* Maid Service Selection — Premium Image Cards */}
          {service_type === 'maid' && selectedFlatSize && <div ref={servicesRef} className="mt-6 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Choose services <span className="text-destructive">*</span>
              </h2>

              {/* Service selection */}
              <div className="space-y-2">
                {([
            { task: 'floor_cleaning' as MaidTask, label: 'Floor Cleaning', desc: 'Jhaadu & Pocha' },
            { task: 'dish_washing' as MaidTask, label: 'Dish Washing', desc: 'Utensils & vessels' }] as
            const).map(({ task, label, desc }) => {
              const isSelected = selectedTasks.includes(task);
              const toggleTask = () => {
                if (isSelected) {
                  if (selectedTasks.length > 1) {
                    setSelectedTasks((prev) => prev.filter((t) => t !== task));
                    if (task === 'dish_washing') setDishIntensity(null);
                  }
                } else {
                  setSelectedTasks((prev) => [...prev, task]);
                }
              };
              return (
                <button
                  key={task}
                  type="button"
                  onClick={toggleTask}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200 text-left",
                    isSelected ?
                    "border-primary bg-primary/5" :
                    "border-border bg-card hover:border-primary/50"
                  )}>

                      <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                    isSelected ? "border-primary" : "border-muted-foreground"
                  )}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <span className="text-[15px] font-bold text-primary shrink-0">₹{taskPrice(task)}</span>
                    </button>);

            })}
              </div>

              {/* Dish Intensity — Soft cards with left accent bar */}
              {selectedTasks.includes('dish_washing') &&
          <div
            ref={dishSectionRef}
            className={cn(
              "space-y-3 rounded-2xl p-3 -mx-3 transition-all duration-500",
              dishHighlight && "ring-2 ring-primary shadow-lg shadow-primary/20 bg-primary/5"
            )}>

                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">How many dishes today?</h3>
                    
                  </div>
                  

                  <div className="grid grid-cols-3 gap-2">
                    {(dishIntensityPrices ?? []).map((p, i) => {
              const opt = { 
                value: p.intensity as DishIntensity, 
                label: p.label, 
                extra: p.extra_inr, 
                desc: p.description,
                emoji: p.intensity === 'light' ? '🍽️' : p.intensity === 'medium' ? '🍽️🥣🥤' : '🍽️🍲🥣🥤🍳',
              };
                const active = dishIntensity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDishIntensity(opt.value)}
                    className={cn(
                      "relative rounded-2xl overflow-hidden text-left transition-all duration-200",
                      active ?
                      "ring-2 ring-primary shadow-md shadow-primary/10 scale-[1.02]" :
                      "ring-1 ring-border shadow-sm hover:shadow-md"
                    )}>

                          <div className={cn(
                            "flex items-center justify-center h-20",
                            active ? "bg-primary/10" : "bg-muted"
                          )}>
                            <span className="text-3xl">{opt.emoji}</span>
                          </div>
                          <div className={cn(
                      "p-2 transition-colors",
                      active ? "bg-primary/5" : "bg-card"
                    )}>
                             <div className="flex items-center justify-between">
                               <p className={cn(
                          "text-xs font-bold",
                          active ? "text-primary" : "text-foreground"
                        )}>{opt.label}</p>
                               <p className={cn(
                          "text-[10px] font-bold",
                          opt.extra > 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                                 {opt.extra > 0 ? `+₹${opt.extra}` : '₹0'}
                               </p>
                             </div>
                             <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                           </div>
                        </button>);

              })}
                  </div>
                  {dishError && !dishIntensity &&
            <p className="text-xs text-destructive font-medium mt-1">⚠️ Please select dish load</p>
            }
                </div>
          }
            </div>}

          {/* Price Display */}
          {(service_type === 'maid' && selectedFlatSize && selectedTasks.length > 0 || service_type === 'bathroom_cleaning' || service_type !== 'maid' && service_type !== 'bathroom_cleaning' && selectedFlatSize) && <div>
            <Card className="bg-primary/5 border-primary/20 rounded-2xl">
              <CardContent className="p-6 py-[5px] px-[24px] bg-stone-50">
                <div className="text-center px-0">
                  {loadingPricing && service_type !== 'maid' && service_type !== 'bathroom_cleaning' ? <Skeleton className="h-8 w-32 mx-auto rounded-lg" /> : <>
                      <span className="text-3xl font-bold text-primary">
                        Price: ₹{currentPrice}
                      </span>
                      {service_type === 'bathroom_cleaning' &&
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Bathroom Cleaning:</span>
                            <span>₹{bathroomUnitPrice ?? 250} × {bathroomCount} = ₹{bathroomBasePrice}</span>
                          </div>
                          {hasGlassPartition &&
                    <div className="flex justify-between text-primary">
                              <span>Glass Partition:</span>
                              <span>₹{GLASS_PARTITION_FEE} × {bathroomCount} = ₹{glassPartitionFee}</span>
                            </div>
                    }
                        </div>
                  }
                    </>}
                </div>
              </CardContent>
            </Card>
            
          </div>}

          {/* Choose Booking Type */}
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Choose Booking Type</h3>
            <div className="grid grid-cols-2 gap-3 items-start">
              {/* Instant Card + Fav Worker stacked */}
              <div className="flex flex-col gap-0">
              {/* Instant Card — books immediately */}
              <button
                onClick={handleInstantClick}
                disabled={!canBook || submitting}
                className={cn(
                  "relative flex flex-col items-start gap-3 p-4 rounded-2xl border-2 shadow-sm transition-all duration-200 text-left",
                  "hover:shadow-md active:scale-[0.98]",
                  "disabled:opacity-50 disabled:pointer-events-none",
                  !isServiceOpen || instantBlocked ?
                  "border-border bg-muted/40 opacity-60" :
                  "border-border bg-card hover:border-primary/40"
                )}>

                {/* Status badge */}
                {!isServiceOpen && (
                  <span className="absolute top-3 right-3 bg-primary text-primary-foreground text-[11px] font-bold px-2 py-0.5 rounded-[10px] leading-tight">
                    Closed
                  </span>
                )}
                {isServiceOpen && instantBlocked && (
                  <span className="absolute top-3 right-3 bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-[10px] leading-tight animate-pulse">
                    Busy
                  </span>
                )}

                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isSupplyFull ? "bg-muted" : "bg-primary/10"
                )}>
                  <Zap className={cn("w-5 h-5", isSupplyFull ? "text-muted-foreground" : "text-primary")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("font-bold text-base", isSupplyFull ? "text-muted-foreground" : "text-foreground")}>Instant</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isSupplyFull ? "Not Available Right Now" : "Get help in 10 mins"}
                  </div>
                </div>
                {submitting && !(!isServiceOpen || instantBlocked) ?
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin absolute top-4 right-4" /> :
                !(!isServiceOpen || instantBlocked) &&
                <ChevronRight className="w-4 h-4 text-muted-foreground absolute top-4 right-4" />
                }
              </button>

              {/* Status hint when instant is unavailable */}
              {(!isServiceOpen || instantBlocked) && (
                <div className="mt-2 animate-fade-in">
                  {!isServiceOpen ? (
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Experts are offline · Schedule for tomorrow →
                    </p>
                  ) : isSupplyFull ? (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <p className="text-xs font-semibold text-orange-600">
                        All experts are busy right now
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <p className="text-xs font-semibold text-orange-600">
                        Instant unavailable right now
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Choose Fav Worker — opens worker selection + books from there */}
              {isServiceOpen && !instantBlocked &&
              <button
                onClick={() => {
                  // Validate before navigating
                  if (service_type === 'maid') {
                    if (!selectedFlatSize || selectedTasks.length === 0) {
                      toast({ title: "Cannot book yet", description: !selectedFlatSize ? "Flat size not available." : "Select at least one task.", variant: "destructive" });
                      return;
                    }
                    if (selectedTasks.includes('dish_washing') && !dishIntensity) {
                      setDishError(true);
                      setDishHighlight(true);
                      dishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => setDishHighlight(false), 2500);
                      toast({ title: "Select dish washing workload", description: "Please choose Light, Medium, or Heavy.", variant: "destructive" });
                      return;
                    }
                    const dishParams = selectedTasks.includes('dish_washing') ? `&dish_intensity=${dishIntensity}&dish_extra=${dishIntensityExtra}` : '';
                    navigate(`/book/${service_type}/instant?flat=${selectedFlatSize}&tasks=${selectedTasks.join(',')}&price=${totalPrice}${dishParams}`);
                  } else if (service_type === 'bathroom_cleaning') {
                    navigate(`/book/${service_type}/instant?bathrooms=${bathroomCount}&glass=${hasGlassPartition ? '1' : '0'}&price=${bathroomTotalPrice}`);
                  } else {
                    if (!selectedFlatSize) return;
                    const price = pricingMap[selectedFlatSize];
                    if (!price) {toast({ title: "Error", description: "Price not available.", variant: "destructive" });return;}
                    navigate(`/book/${service_type}/instant?flat=${selectedFlatSize}&price=${price}`);
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 mt-2 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors">

                  {preferredWorker ?
                <>
                      <Avatar className="w-6 h-6">
                        {preferredWorker.photo_url && <AvatarImage src={preferredWorker.photo_url} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                          {preferredWorker.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">{preferredWorker.full_name}</p>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          {preferredWorker.rating_avg.toFixed(1)}
                        </p>
                      </div>
                      <button
                    onClick={(e) => {e.stopPropagation();clearPreferredWorker();}}
                    className="p-0.5 rounded-full hover:bg-muted">

                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </> :

                <>
                      <div className="flex -space-x-1.5">
                        {[0, 1, 2].map((i) =>
                    <div key={i} className="w-5 h-5 rounded-full border-[1.5px] border-card bg-primary/10 flex items-center justify-center overflow-hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-primary/60"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z" /></svg>
                          </div>
                    )}
                      </div>
                      <span className="flex-1 text-[11px] font-medium text-primary">Choose Your Fav Maid For Instant</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </>
                }
                </button>
              }
              </div>

              {/* Schedule Card */}
              <button
              onClick={() => {
                if (service_type === 'maid') {
                  if (!selectedFlatSize || selectedTasks.length === 0) {
                    toast({
                      title: "Please complete maid booking details",
                      description: "Select flat size and at least one task before scheduling.",
                      variant: "destructive"
                    });
                    return;
                  }
                  if (selectedTasks.includes('dish_washing') && !dishIntensity) {
                    setDishError(true);
                    setDishHighlight(true);
                    dishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => setDishHighlight(false), 2500);
                    toast({
                      title: "Select dish washing workload",
                      description: "Please choose Light, Medium, or Heavy for dish washing.",
                      variant: "destructive"
                    });
                    return;
                  }
                  const price = totalPrice;
                  const dishParams = selectedTasks.includes('dish_washing') ?
                  `&dish_intensity=${dishIntensity}&dish_extra=${dishIntensityExtra}` :
                  '';
                  navigate(`/book/${service_type}/schedule?flat=${selectedFlatSize}&tasks=${selectedTasks.join(',')}&price=${price}${dishParams}`);
                } else if (service_type === 'bathroom_cleaning') {
                  const price = bathroomTotalPrice;
                  navigate(`/book/${service_type}/schedule?bathrooms=${bathroomCount}&glass=${hasGlassPartition ? '1' : '0'}&price=${price}`);
                } else {
                  if (!selectedFlatSize) {
                    toast({
                      title: "Please select flat size first",
                      description: "Choose a flat size before scheduling.",
                      variant: "destructive"
                    });
                    return;
                  }
                  const price = pricingMap[selectedFlatSize];
                  navigate(`/book/${service_type}/schedule?flat=${selectedFlatSize}&price=${price}`);
                }
              }}
              disabled={service_type === 'maid' ? !selectedFlatSize || selectedTasks.length === 0 || selectedTasks.includes('dish_washing') && !dishIntensity : service_type === 'bathroom_cleaning' ? false : !selectedFlatSize}
              className={cn(
                "relative flex flex-col items-start gap-3 p-4 rounded-2xl border-2 shadow-sm transition-all duration-200 text-left",
                "hover:shadow-md active:scale-[0.98]",
                "disabled:opacity-50 disabled:pointer-events-none",
                "border-border bg-card hover:border-primary/40"
              )}>

                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-base">Schedule</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Pick your time</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground absolute top-4 right-4" />
              </button>
            </div>

          </div>
        </div>

        {/* Schedule Sheet */}
        <ScheduleSheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen} onSchedule={handleSchedule} loading={submitting} serviceType={service_type} community={profile?.community} />
        
        {/* Maid Price Chart Sheet */}
        {service_type === 'maid' &&
      <MaidPriceChartSheet
        open={priceChartOpen}
        onOpenChange={setPriceChartOpen}
        userFlatSize={selectedFlatSize}
        community={profile?.community} />
      }

        {/* Supply Full Modal */}
        <SupplyFullModal
          open={supplyModalOpen}
          onClose={() => setSupplyModalOpen(false)}
          onSchedule={() => {
            setSupplyModalOpen(false);
            handleSchedule();
          }}
        />

        {/* Payment Choice Sheet */}
        <PaymentChoiceSheet
          open={paymentChoiceOpen}
          onOpenChange={setPaymentChoiceOpen}
          price={getInstantPrice()}
          onPayAfterService={handlePayAfterService}
          onPayNow={handlePayNowFromSheet}
          submitting={submitting}
        />
      </div>
    </div>;
}