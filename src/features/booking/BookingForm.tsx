import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Home, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import { prettyServiceName, serviceIcon, isValidServiceType, getPricingMap, FLAT_SIZES, type FlatSize, type PricingMap, calculateCookPrice } from './pricing';
import { isOpenNow, getOpenStatusText } from '@/features/home/time';
import { ScheduleSheet } from './ScheduleSheet';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PriceNote } from '@/components/PriceNote';
import { isGuestMode } from '@/lib/demo';

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

  // Cook service specific state
  const [familyCount, setFamilyCount] = useState(1);
  const [foodPreference, setFoodPreference] = useState<'veg' | 'non_veg' | null>(null);
  const [cuisinePref, setCuisinePref] = useState<'north' | 'south' | 'any'>('any');
  const [genderPref, setGenderPref] = useState<'male' | 'female' | 'any'>('any');

  // Maid service specific state
  const [selectedTasks, setSelectedTasks] = useState<MaidTask[]>(["floor_cleaning", "dish_washing"]); // Multiple task selection with checkboxes

  // Bathroom cleaning specific state
  const [bathroomCount, setBathroomCount] = useState(1);

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
      (data || []).filter(row => row.community === null).forEach((row: any) => {
        map.set(row.task, row.price_inr);
      });

      // Then, override with community-specific pricing if available
      if (profile?.community) {
        (data || []).filter(row => row.community === profile.community).forEach((row: any) => {
          map.set(row.task, row.price_inr);
        });
      }

      // Ensure both tasks have prices (fallback)
      (["floor_cleaning", "dish_washing"] as MaidTask[]).forEach(t => {
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
      const { data: specific } = await supabase
        .from("bathroom_pricing_settings")
        .select("unit_price_inr")
        .eq("community", profile?.community || "")
        .maybeSingle();
      if (specific) return specific.unit_price_inr;

      // global fallback
      const { data: global } = await supabase
        .from("bathroom_pricing_settings")
        .select("unit_price_inr")
        .eq("community", "")
        .maybeSingle();
      return global?.unit_price_inr ?? 250;
    }
  });

  // Helper functions for maid pricing
  const taskPrice = (t: MaidTask) => taskPrices?.get(t) ?? FALLBACK_PRICES[selectedFlatSize || "2BHK"];
  const totalPrice = service_type === 'maid' && selectedTasks.length > 0 ? selectedTasks.reduce((sum, task) => sum + taskPrice(task), 0) : 0;
  
  // Bathroom pricing calculation
  const bathroomTotalPrice = service_type === 'bathroom_cleaning' ? (bathroomUnitPrice ?? 250) * Math.max(1, bathroomCount) : 0;
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
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
    if (profile && service_type && service_type !== 'cook' && service_type !== 'maid' && service_type !== 'bathroom_cleaning') {
      loadPricing();
    } else if (service_type === 'cook' || service_type === 'maid' || service_type === 'bathroom_cleaning') {
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
    if (service_type === 'cook') {
      if (!foodPreference) {
        toast({
          title: "Please select food preference",
          description: "Choose vegetarian or non-vegetarian option.",
          variant: "destructive"
        });
        return;
      }
      const price = calculateCookPrice(familyCount, foodPreference);
      await createBooking('instant', null, null, price);
    } else if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({
          title: "Please complete maid booking details",
          description: "Select flat size and at least one task before booking.",
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
    
    if (service_type === 'cook') {
      if (!foodPreference) {
        toast({
          title: "Please select food preference",
          description: "Choose vegetarian or non-vegetarian option.",
          variant: "destructive"
        });
        return;
      }
      params.set('family', familyCount.toString());
      params.set('food', foodPreference);
      params.set('cuisine', cuisinePref);
      params.set('gender', genderPref);
      const price = calculateCookPrice(familyCount, foodPreference);
      params.set('price', price.toString());
    } else if (service_type === 'maid') {
      if (!selectedFlatSize || selectedTasks.length === 0) {
        toast({
          title: "Please complete maid booking details",
          description: "Select flat size and at least one task before scheduling.",
          variant: "destructive"
        });
        return;
      }
      params.set('flat', selectedFlatSize);
      params.set('price', totalPrice.toString());
    } else if (service_type === 'bathroom_cleaning') {
      params.set('bathrooms', bathroomCount.toString());
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
    if (!profile || !user || !service_type) return;
    if (service_type !== 'cook' && service_type !== 'bathroom_cleaning' && !selectedFlatSize) return;
    
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
        user_id: profile.id, // Use profile UUID, not Firebase UID
        service_type,
        booking_type: bookingType,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'cook' || service_type === 'bathroom_cleaning' ? null : selectedFlatSize,
        price_inr: price,
        family_count: service_type === 'cook' ? familyCount : null,
        food_pref: service_type === 'cook' ? foodPreference : null,
        cook_cuisine_pref: service_type === 'cook' ? cuisinePref : null,
        cook_gender_pref: service_type === 'cook' ? genderPref : null,
        maid_tasks: service_type === 'maid' ? selectedTasks : null,
        bathroom_count: service_type === 'bathroom_cleaning' ? bathroomCount : null,
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
  const currentPrice = service_type === 'cook' ? foodPreference ? calculateCookPrice(familyCount, foodPreference) : null 
    : service_type === 'maid' ? selectedFlatSize && selectedTasks.length > 0 ? totalPrice : null 
    : service_type === 'bathroom_cleaning' ? bathroomTotalPrice
    : selectedFlatSize ? pricingMap[selectedFlatSize] : null;
  const isServiceOpen = isOpenNow();
  const canBook = isServiceOpen && (
    service_type === 'cook' ? foodPreference && !submitting 
    : service_type === 'maid' ? selectedFlatSize && selectedTasks.length > 0 && !submitting 
    : service_type === 'bathroom_cleaning' ? !submitting
    : selectedFlatSize && currentPrice && !submitting
  );

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
                  className="w-full h-16 rounded-2xl font-bold text-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                >
                  Create Account & Book Now
                </Button>
                
                <Button 
                  onClick={() => navigate('/home')}
                  variant="outline"
                  className="w-full h-14 rounded-2xl font-semibold border-primary/20 text-primary hover:bg-primary/5 transition-all duration-300"
                >
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
      </div>
    );
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
          {/* Booking Details Card */}
          {profile && service_type === 'cook' && <div className="space-y-6">
              <h2 className="text-2xl font-bold text-[#ff007a] text-center">
                Booking Details
              </h2>
              
              <div className="space-y-4">
                <Card className="border border-gray-200 rounded-2xl bg-white shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-[#ff007a]" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-gray-700 font-medium">Community</span>
                        <span className="text-gray-900 font-bold">{profile.community}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border border-gray-200 rounded-2xl bg-white shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Home className="w-5 h-5 text-[#ff007a]" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-gray-700 font-medium">Flat Number</span>
                        <span className="text-gray-900 font-bold">{profile.flat_no}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>}

          {/* Community & Flat Cards for other services */}
          {profile && service_type !== 'cook' && <>
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

          {/* Cook Service Controls */}
          {service_type === 'cook' && <>
              {/* Family Count */}
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Number of Family Members <span className="text-[#ff007a]">*</span>
                </h2>
                <div className="flex items-center justify-center gap-6">
                  <Button variant="outline" className="h-12 w-12 rounded-xl border-2 border-[#ff007a] text-[#ff007a] hover:bg-[#ff007a] hover:text-white" onClick={() => setFamilyCount(Math.max(1, familyCount - 1))} disabled={familyCount <= 1}>
                    –
                  </Button>
                  <div className="w-12 text-center text-3xl font-bold text-gray-900">{familyCount}</div>
                  <Button variant="outline" className="h-12 w-12 rounded-xl border-2 border-[#ff007a] text-[#ff007a] hover:bg-[#ff007a] hover:text-white" onClick={() => setFamilyCount(Math.min(20, familyCount + 1))}>
                    +
                  </Button>
                </div>
              </div>

              {/* Food Preference */}
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Food Preference <span className="text-[#ff007a]">*</span>
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setFoodPreference('veg')} className={`h-16 rounded-2xl border-2 px-4 flex items-center justify-center gap-3 transition-all ${foodPreference === 'veg' ? 'border-[#ff007a] bg-[#ff007a]/10 text-[#ff007a]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'}`}>
                    <span className="text-xl">🥬</span>
                    <span className="font-medium">Vegetarian</span>
                  </button>
                  <button onClick={() => setFoodPreference('non_veg')} className={`h-16 rounded-2xl border-2 px-4 flex items-center justify-center gap-3 transition-all ${foodPreference === 'non_veg' ? 'border-[#ff007a] bg-[#ff007a]/10 text-[#ff007a]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'}`}>
                    <span className="text-xl">🍗</span>
                    <span className="font-medium">Non-Vegetarian</span>
                  </button>
                </div>
              </div>

              {/* Cuisine Preference - Only show after food preference is selected */}
              {foodPreference && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-foreground">
                  Cuisine Preference <span className="text-destructive">*</span>
                </h2>
                <ToggleGroup
                  type="single"
                  value={cuisinePref}
                  onValueChange={(v) => v && setCuisinePref(v as 'north' | 'south' | 'any')}
                  className="grid grid-cols-3 gap-3"
                >
                  <ToggleGroupItem
                    value="north"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      cuisinePref === 'north'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    North Indian
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="south"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      cuisinePref === 'south'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    South Indian
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="any"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      cuisinePref === 'any'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    Anyone is fine
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              )}

              {/* Gender Preference - Only show after food preference is selected */}
              {foodPreference && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-foreground">
                  Cook Gender Preference <span className="text-destructive">*</span>
                </h2>
                <ToggleGroup
                  type="single"
                  value={genderPref}
                  onValueChange={(v) => v && setGenderPref(v as 'male' | 'female' | 'any')}
                  className="grid grid-cols-3 gap-3"
                >
                  <ToggleGroupItem
                    value="male"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      genderPref === 'male'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    Male
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="female"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      genderPref === 'female'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    Female
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="any"
                    className={cn(
                      "h-12 rounded-xl border-2",
                      genderPref === 'any'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    Anyone is fine
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              )}
            </>}

          {/* Select Flat Size for other services */}
          {service_type !== 'cook' && service_type !== 'bathroom_cleaning' && <div className="mt-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Select Flat Size <span className="text-destructive">*</span>
              </h2>
              
              <div className="grid grid-cols-3 gap-3 mb-3">
                {FLAT_SIZES.slice(0, 3).map(size => <Button key={size} variant="outline" onClick={() => setSelectedFlatSize(size)} className={`h-12 font-medium rounded-2xl border-2 ${selectedFlatSize === size ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"}`}>
                    {size}
                  </Button>)}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {FLAT_SIZES.slice(3).map(size => <Button key={size} variant="outline" onClick={() => setSelectedFlatSize(size)} className={`h-12 font-medium rounded-2xl border-2 ${selectedFlatSize === size ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"}`}>
                    {size}
                  </Button>)}
              </div>
            </div>}

          {/* Bathroom Count Selector */}
          {service_type === 'bathroom_cleaning' && <div className="mt-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                How many bathrooms? <span className="text-destructive">*</span>
              </h2>
              
              {/* stepper */}
              <div className="flex items-center justify-center gap-4 mt-4">
                <Button 
                  variant="outline"
                  onClick={() => setBathroomCount(c => Math.max(1, c - 1))}
                  className="w-12 h-12 rounded-xl border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  disabled={bathroomCount <= 1}
                >
                  −
                </Button>
                <div className="min-w-12 text-center text-2xl font-bold text-foreground">{bathroomCount}</div>
                <Button 
                  variant="outline"
                  onClick={() => setBathroomCount(c => Math.min(10, c + 1))}
                  className="w-12 h-12 rounded-xl border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  +
                </Button>
              </div>
            </div>}

          {/* Maid Task Selection - Modern Checkbox UI */}
          {service_type === 'maid' && selectedFlatSize && <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Selected services <span className="text-destructive">*</span>
              </h2>
              <div className="space-y-2">
                {(["floor_cleaning", "dish_washing"] as MaidTask[]).map(t => {
              const isSelected = selectedTasks.includes(t);
              const toggleTask = () => {
                if (isSelected) {
                  // Don't allow unselecting if it's the only task selected
                  if (selectedTasks.length > 1) {
                    setSelectedTasks(prev => prev.filter(task => task !== t));
                  }
                } else {
                  setSelectedTasks(prev => [...prev, t]);
                }
              };
              return <div key={t} onClick={toggleTask} className={cn("relative cursor-pointer rounded-xl border-2 p-3 transition-all duration-200", isSelected ? "border-primary bg-gradient-to-r from-primary/10 to-primary/5" : "border-border bg-card hover:border-primary/50")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center", isSelected ? "border-primary bg-primary" : "border-muted-foreground")}>
                            {isSelected && <div className="w-2 h-2 rounded-sm bg-primary-foreground" />}
                          </div>
                          <div>
                            <h3 className="font-medium text-foreground text-sm">
                              {TASK_LABEL[t]}
                            </h3>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">₹{taskPrice(t)}</div>
                        </div>
                      </div>
                    </div>;
            })}
              </div>
              
            </div>}

          {/* Price Display */}
          {(service_type === 'cook' && foodPreference || service_type === 'maid' && selectedFlatSize && selectedTasks.length > 0 || service_type === 'bathroom_cleaning' || (service_type !== 'cook' && service_type !== 'maid' && service_type !== 'bathroom_cleaning' && selectedFlatSize)) && <div>
            <Card className="bg-primary/5 border-primary/20 rounded-2xl">
              <CardContent className="p-6 py-[5px] px-[24px] bg-stone-50">
                <div className="text-center px-0">
                  {loadingPricing && service_type !== 'cook' && service_type !== 'maid' && service_type !== 'bathroom_cleaning' ? <Skeleton className="h-8 w-32 mx-auto rounded-lg" /> : <>
                      <span className="text-3xl font-bold text-primary">
                        Price: ₹{currentPrice}
                      </span>
                      {service_type === 'bathroom_cleaning' && (
                        <div className="text-xs text-gray-500 mt-1">Unit: ₹{bathroomUnitPrice ?? 250} × {bathroomCount}</div>
                      )}
                    </>}
                </div>
              </CardContent>
            </Card>
            <PriceNote className="pb-2" />
          </div>}

          {/* Action Buttons */}
          <div className="space-y-6 mt-8">
            {/* Instant Service Button */}
            <div className="relative">
              <Button 
                onClick={handleBookNow} 
                disabled={!canBook} 
                className="w-full h-16 rounded-2xl font-bold text-lg bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] disabled:transform-none disabled:shadow-md"
              >
                {submitting ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-lg">Processing...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5" />
                    <span>{isServiceOpen ? "Book Now - Instant Service" : "Service Closed"}</span>
                  </div>
                )}
              </Button>
              {!isServiceOpen && (
                <div className="mt-2 text-center text-sm text-muted-foreground">
                  Service hours: 6:00 AM - 7:00 PM. {getOpenStatusText()}
                </div>
              )}
              {!canBook && (
                <div className="absolute inset-0 bg-black/5 rounded-2xl pointer-events-none" />
              )}
            </div>

            {/* Schedule Later Card */}
            <Card className="bg-gradient-to-br from-slate-50 to-white border-2 border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-1">
                      Schedule Later
                    </h3>
                    <p className="text-slate-600 text-sm">
                      Choose your preferred time slot
                    </p>
                  </div>
                  <div className="bg-pink-100 p-3 rounded-full">
                    <Calendar className="w-6 h-6 text-pink-600" />
                  </div>
                </div>
                
                <Button 
                  onClick={() => {
                    if (service_type === 'cook') {
                      if (!foodPreference) {
                        toast({
                          title: "Please select food preference first",
                          description: "Choose vegetarian or non-vegetarian option.",
                          variant: "destructive"
                        });
                        return;
                      }
                      const price = calculateCookPrice(familyCount, foodPreference);
                      navigate(`/book/${service_type}/schedule?family=${familyCount}&food=${foodPreference}&cuisine=${cuisinePref}&gender=${genderPref}&price=${price}`);
                    } else if (service_type === 'maid') {
                      if (!selectedFlatSize || selectedTasks.length === 0) {
                        toast({
                          title: "Please complete maid booking details",
                          description: "Select flat size and at least one task before scheduling.",
                          variant: "destructive"
                        });
                        return;
                      }
                      const price = totalPrice;
                      navigate(`/book/${service_type}/schedule?flat=${selectedFlatSize}&tasks=${selectedTasks.join(',')}&price=${price}`);
                    } else if (service_type === 'bathroom_cleaning') {
                      const price = bathroomTotalPrice;
                      navigate(`/book/${service_type}/schedule?bathrooms=${bathroomCount}&price=${price}`);
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
                  disabled={service_type === 'cook' ? !foodPreference : service_type === 'maid' ? !selectedFlatSize || selectedTasks.length === 0 : service_type === 'bathroom_cleaning' ? false : !selectedFlatSize} 
                  className="w-full h-14 rounded-2xl font-semibold text-lg bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-300 hover:border-pink-400 shadow-sm hover:shadow-md transition-all duration-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200"
                >
                  <span>Schedule Booking</span>
                  <ArrowLeft className="w-5 h-5 ml-3 rotate-180" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Schedule Sheet */}
        <ScheduleSheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen} onSchedule={handleSchedule} loading={submitting} />
      </div>
    </div>;
}