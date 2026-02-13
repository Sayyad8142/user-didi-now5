import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Home, Clock, Calendar, AlertCircle, Check, Zap, ChevronRight } from 'lucide-react';
import serviceFloorImg from '@/assets/service-floor-cleaning.webp';
import serviceDishImg from '@/assets/service-dish-washing.webp';
import dishesLightImg from '@/assets/dishes-light.webp';
import dishesMediumImg from '@/assets/dishes-medium.webp';
import dishesHeavyImg from '@/assets/dishes-heavy.webp';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { getIntensityExtra, type DishIntensity } from './DishIntensitySheet';

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
  const [selectedFlatSize, setSelectedFlatSize] = useState<FlatSize | null>(null);
  const [pricingMap, setPricingMap] = useState<PricingMap>({});
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Check instant booking availability (must be before any early returns)
  const { isAvailable: instantAvailable, isError: instantError, isLoading: instantLoading } = useInstantBookingAvailability(service_type || '');
  const instantDisabled = !instantLoading && (!instantAvailable || instantError);


  // Maid service specific state
  const [selectedTasks, setSelectedTasks] = useState<MaidTask[]>(["floor_cleaning", "dish_washing"]); // Multiple task selection with checkboxes
  const [dishIntensity, setDishIntensity] = useState<DishIntensity | null>(null);

  // Bathroom cleaning specific state
  const [bathroomCount, setBathroomCount] = useState(1);
  const [hasGlassPartition, setHasGlassPartition] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const GLASS_PARTITION_FEE = 30; // ₹30 per bathroom

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
    if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({
          title: "Please complete maid booking details",
          description: "Select flat size and at least one task before booking.",
          variant: "destructive"
        });
        return;
      }
      // Validate dish intensity selection if dish washing is selected
      if (selectedTasks.includes('dish_washing') && !dishIntensity) {
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
  const handleSchedule = () => {
    if (!profile || !service_type) return;

    // Build query parameters for ScheduleScreen
    const params = new URLSearchParams();

    if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({
          title: "Please complete maid booking details",
          description: "Select flat size and at least one task before scheduling.",
          variant: "destructive"
        });
        return;
      }
      // Validate dish intensity selection if dish washing is selected
      if (selectedTasks.includes('dish_washing') && !dishIntensity) {
        toast({
          title: "Select dish washing workload",
          description: "Please choose Light, Medium, or Heavy for dish washing.",
          variant: "destructive"
        });
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
        toast({
          title: "Error",
          description: "Price not available for selected flat size.",
          variant: "destructive"
        });
        return;
      }
      params.set('flat', selectedFlatSize);
      params.set('price', price.toString());
    }

    navigate(`/schedule/${service_type}?${params.toString()}`);
  };
  const createBooking = async (bookingType: 'instant' | 'scheduled', scheduledDate: string | null, scheduledTime: string | null, price: number) => {
    if (service_type !== 'bathroom_cleaning' && !selectedFlatSize) return;

    // Validate community before booking
    if (!profile.community || profile.community === 'other') {
      console.error('❌ Invalid community in profile:', profile.community);
      toast({
        title: "Profile Incomplete",
        description: "Please complete your profile with community information before booking.",
        variant: "destructive"
      });
      navigate('/profile/settings');
      return;
    }

    console.log('📝 Creating booking:', {
      serviceType: service_type,
      bookingType,
      community: profile.community,
      flatNo: profile.flat_no,
      userId: user.id,
      price,
      scheduledDate,
      scheduledTime,
      timestamp: new Date().toISOString()
    });

    setSubmitting(true);
    try {
      const bookingData = {
        user_id: profile.id,
        service_type,
        booking_type: bookingType,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
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
        cust_name: profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no
      };

      console.log('📤 Sending booking data to database:', bookingData);

      const { data, error } = await supabase.from('bookings').insert([bookingData]).select();

      if (error) {
        console.error('❌ Booking error:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        toast({
          title: "Booking Failed",
          description: `Error: ${error.message || 'Please try again.'}`,
          variant: "destructive"
        });
        return;
      }

      console.log('✅ Booking created successfully:', data);

      toast({
        title: "Booking received!",
        description: bookingType === 'instant' ? "Service will arrive in 10 minutes." : "Your booking has been scheduled successfully."
      });
      setScheduleSheetOpen(false);
      navigate('/home');
    } catch (err) {
      console.error('❌ Booking error:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
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




  const canBook = isServiceOpen && !instantDisabled && (
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

        <div className="space-y-4">
          {/* Community & Flat Cards */}
          {profile && <>
              <Card className="border border-border rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-primary" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-foreground font-medium">Community</span>
                      <span className="text-foreground font-semibold">{profile.community}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Home className="w-5 h-5 text-primary" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-foreground font-medium">Flat Number</span>
                      <span className="text-foreground font-semibold">{profile.flat_no}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>}

          {/* Select Flat Size */}
          {service_type !== 'bathroom_cleaning' && <div className="mt-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Select Flat Size <span className="text-destructive">*</span>
              </h2>
              
              <div className="grid grid-cols-3 gap-3 mb-3">
                {FLAT_SIZES.slice(0, 3).map((size) => <Button key={size} variant="outline" onClick={() => { setSelectedFlatSize(size); setTimeout(() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }} className={`h-12 font-medium rounded-2xl border-2 ${selectedFlatSize === size ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"}`}>
                    {size}
                  </Button>)}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {FLAT_SIZES.slice(3).map((size) => <Button key={size} variant="outline" onClick={() => { setSelectedFlatSize(size); setTimeout(() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }} className={`h-12 font-medium rounded-2xl border-2 ${selectedFlatSize === size ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"}`}>
                    {size}
                  </Button>)}
              </div>
            </div>}

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

              {/* Service image cards */}
              <div className="grid grid-cols-2 gap-3">
                {([
            { task: 'floor_cleaning' as MaidTask, label: 'Floor Cleaning', desc: 'Jhaadu & Pocha', img: serviceFloorImg },
            { task: 'dish_washing' as MaidTask, label: 'Dish Washing', desc: 'Utensils & vessels', img: serviceDishImg }] as
            const).map(({ task, label, desc, img }) => {
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
                    "relative rounded-2xl overflow-hidden shadow-sm transition-all duration-200 text-left group",
                    isSelected ?
                    "ring-2 ring-primary shadow-md shadow-primary/10" :
                    "ring-1 ring-border hover:shadow-md"
                  )}>

                      {/* Image */}
                      <div className="relative h-28 overflow-hidden">
                        <img src={img} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        {isSelected &&
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                    }
                      </div>
                      {/* Info */}
                      <div className={cn(
                    "p-3 transition-colors",
                    isSelected ? "bg-primary/5" : "bg-card"
                  )}>
                        <h3 className="font-semibold text-foreground text-sm">{label}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        <p className="text-lg font-bold text-primary mt-1">
                          ₹{taskPrice(task)}
                        </p>
                      </div>
                    </button>);

            })}
              </div>

              {/* Dish Intensity — Soft cards with left accent bar */}
              {selectedTasks.includes('dish_washing') &&
          <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">How many dishes today?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Pick right to avoid disputes</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
              { value: 'light' as DishIntensity, label: 'Light', extra: 0, desc: '5-10 items', img: dishesLightImg },
              { value: 'medium' as DishIntensity, label: 'Medium', extra: 30, desc: '10-20 items', img: dishesMediumImg },
              { value: 'heavy' as DishIntensity, label: 'Heavy', extra: 50, desc: '20+ items', img: dishesHeavyImg }].
              map((opt) => {
                const active = dishIntensity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDishIntensity(opt.value)}
                    className={cn(
                      "relative rounded-2xl overflow-hidden text-left transition-all duration-200",
                      active ?
                      "ring-2 ring-primary shadow-md shadow-primary/10" :
                      "ring-1 ring-border shadow-sm hover:shadow-md"
                    )}>

                          <div className="relative h-20 overflow-hidden">
                            <img src={opt.img} alt={opt.label} className="w-full h-full object-cover" />
                            {active &&
                      <div className="absolute inset-0 bg-primary/20" />
                      }
                          </div>
                          <div className={cn(
                      "p-2 text-center transition-colors",
                      active ? "bg-primary/5" : "bg-card"
                    )}>
                            <p className={cn(
                        "text-xs font-bold",
                        active ? "text-primary" : "text-foreground"
                      )}>{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                            <p className={cn(
                        "text-xs font-bold mt-0.5",
                        opt.extra > 0 ? "text-orange-500" : "text-muted-foreground"
                      )}>
                              {opt.extra > 0 ? `+₹${opt.extra}` : '₹0'}
                            </p>
                          </div>
                        </button>);

              })}
                  </div>
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
            <PriceNote className="pb-2" />
          </div>}

          {/* Choose Booking Type */}
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Choose Booking Type</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Instant Card */}
              <button
              onClick={handleBookNow}
              disabled={!canBook}
              className={cn(
                "relative flex flex-col items-start gap-3 p-4 rounded-2xl border-2 shadow-sm transition-all duration-200 text-left",
                "hover:shadow-md active:scale-[0.98]",
                "disabled:opacity-50 disabled:pointer-events-none",
                !isServiceOpen || instantDisabled ?
                "border-border bg-muted/40 opacity-60 pointer-events-none" :
                "border-border bg-card hover:border-primary/40"
              )}>

                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-base">Instant</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Get help in 10 mins</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground absolute top-4 right-4" />
                {submitting &&
              <div className="absolute inset-0 bg-card/80 rounded-2xl flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
              }
              </button>

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

            {/* Instant unavailable hint */}
            {!isServiceOpen &&
          <p className="text-xs text-muted-foreground mt-1 text-left">
                We'll be back at 7:00 AM
              </p>
          }
            {isServiceOpen && instantDisabled &&
          <p className="text-xs text-muted-foreground text-center mt-1">
                Instant unavailable right now — try scheduling instead
              </p>
          }
          </div>
        </div>

        {/* Schedule Sheet */}
        <ScheduleSheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen} onSchedule={handleSchedule} loading={submitting} />
        
      </div>
    </div>;
}