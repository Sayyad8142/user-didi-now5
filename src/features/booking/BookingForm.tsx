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
import { useProfile } from '@/features/profile/useProfile';
import { prettyServiceName, serviceIcon, isValidServiceType, getPricingMap, FLAT_SIZES, type FlatSize, type PricingMap, calculateCookPrice } from './pricing';
import { ScheduleSheet } from './ScheduleSheet';
import { cn } from '@/lib/utils';

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
    loading: profileLoading
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

  // Maid service specific state
  const [selectedTasks, setSelectedTasks] = useState<MaidTask>("floor_cleaning"); // Single task selection with radio

  // Fetch maid task prices
  const {
    data: taskPrices
  } = useQuery({
    queryKey: ["maid_prices", selectedFlatSize, profile?.community],
    enabled: !!selectedFlatSize && service_type === 'maid',
    queryFn: async () => {
      const q = supabase.from("maid_pricing_tasks").select("task, price_inr, community").eq("flat_size", selectedFlatSize!).eq("active", true);
      if (profile?.community) {
        q.or(`community.is.null,community.eq.${profile.community}`);
      } else {
        q.is('community', null);
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

  // Helper functions for maid pricing
  const taskPrice = (t: MaidTask) => taskPrices?.get(t) ?? FALLBACK_PRICES[selectedFlatSize || "2BHK"];
  const totalPrice = service_type === 'maid' ? taskPrice(selectedTasks) : 0;
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (service_type && !isValidServiceType(service_type)) {
      navigate('/home');
      return;
    }
  }, [user, service_type, navigate]);
  useEffect(() => {
    if (profile && service_type && service_type !== 'cook' && service_type !== 'maid') {
      loadPricing();
    } else if (service_type === 'cook' || service_type === 'maid') {
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
      if (!selectedFlatSize || !selectedTasks) {
        toast({
          title: "Please complete maid booking details",
          description: "Select flat size and a task before booking.",
          variant: "destructive"
        });
        return;
      }
      await createBooking('instant', null, null, totalPrice);
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
  const handleSchedule = async (date: Date, time: string) => {
    if (!profile || !service_type) return;
    if (service_type === 'cook') {
      if (!foodPreference) return;
      const price = calculateCookPrice(familyCount, foodPreference);
      await createBooking('scheduled', date.toISOString().split('T')[0], time, price);
    } else if (service_type === 'maid') {
      if (!selectedFlatSize || !selectedTasks) return;
      await createBooking('scheduled', date.toISOString().split('T')[0], time, totalPrice);
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
      await createBooking('scheduled', date.toISOString().split('T')[0], time, price);
    }
  };
  const createBooking = async (bookingType: 'instant' | 'scheduled', scheduledDate: string | null, scheduledTime: string | null, price: number) => {
    if (!profile || !user || !service_type) return;
    if (service_type !== 'cook' && !selectedFlatSize) return;
    setSubmitting(true);
    try {
      const bookingData = {
        user_id: user.id,
        service_type,
        booking_type: bookingType,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'cook' ? null : selectedFlatSize,
        price_inr: price,
        family_count: service_type === 'cook' ? familyCount : null,
        food_pref: service_type === 'cook' ? foodPreference : null,
        maid_tasks: service_type === 'maid' ? [selectedTasks] : null,
        cust_name: profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no
      };
      const {
        error
      } = await supabase.from('bookings').insert([bookingData]);
      if (error) {
        console.error('Booking error:', error);
        toast({
          title: "Booking Failed",
          description: "There was an error creating your booking. Please try again.",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "Booking received!",
        description: bookingType === 'instant' ? "Service will arrive in 10 minutes." : "Your booking has been scheduled successfully."
      });
      setScheduleSheetOpen(false);
      navigate('/bookings');
    } catch (err) {
      console.error('Booking error:', err);
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
  if (profileLoading) {
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
  const currentPrice = service_type === 'cook' ? foodPreference ? calculateCookPrice(familyCount, foodPreference) : null : service_type === 'maid' ? selectedFlatSize && selectedTasks ? totalPrice : null : selectedFlatSize ? pricingMap[selectedFlatSize] : null;
  const canBook = service_type === 'cook' ? foodPreference && !submitting : service_type === 'maid' ? selectedFlatSize && selectedTasks && !submitting : selectedFlatSize && currentPrice && !submitting;
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
            </>}

          {/* Select Flat Size for other services */}
          {service_type !== 'cook' && <div className="mt-8">
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

          {/* Maid Task Selection - Modern Radio Button UI */}
          {service_type === 'maid' && selectedFlatSize && <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Select Service <span className="text-destructive">*</span>
              </h2>
              <div className="space-y-3">
                {(["floor_cleaning", "dish_washing"] as MaidTask[]).map(t => {
              const active = selectedTasks === t;
              return <div key={t} onClick={() => setSelectedTasks(t)} className={cn("relative cursor-pointer rounded-2xl border-2 p-5 transition-all duration-200", active ? "border-primary bg-gradient-to-r from-primary/10 to-primary/5 shadow-lg shadow-primary/20" : "border-border bg-card hover:border-primary/50 hover:shadow-md")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", active ? "border-primary bg-primary" : "border-muted-foreground")}>
                            {active && <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground" />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {TASK_LABEL[t]}
                            </h3>
                            
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">₹{taskPrice(t)}</div>
                          
                        </div>
                      </div>
                      {active && <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />}
                    </div>;
            })}
              </div>
              
            </div>}

          {/* Price Display */}
          {(service_type === 'cook' && foodPreference || service_type === 'maid' && selectedFlatSize && selectedTasks || service_type !== 'cook' && service_type !== 'maid' && selectedFlatSize) && <Card className="bg-primary/5 border-primary/20 rounded-2xl">
              <CardContent className="p-6">
                <div className="text-center">
                  {loadingPricing && service_type !== 'cook' && service_type !== 'maid' ? <Skeleton className="h-8 w-32 mx-auto rounded-lg" /> : <>
                      <span className="text-3xl font-bold text-primary">
                        Price: ₹{currentPrice}
                      </span>
                      {service_type === 'maid' && selectedFlatSize && <div className="mt-1 text-xs text-muted-foreground">
                          Includes selected tasks • Flat size: {selectedFlatSize}
                        </div>}
                    </>}
                </div>
              </CardContent>
            </Card>}

          {/* Action Buttons */}
          <div className="space-y-4 mt-8">
            <Button onClick={handleBookNow} disabled={!canBook} className="w-full h-14 rounded-full font-semibold text-lg bg-pink-500 hover:bg-pink-600 text-white border-0">
              {submitting ? <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Booking...</span>
                </div> : "Book Now - Instant Service"}
            </Button>

            {/* Schedule Later Card */}
            <Card className="bg-background border border-border rounded-2xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground">
                    Schedule your slot for later
                  </h3>
                  <Calendar className="w-6 h-6 text-pink-500" />
                </div>
                
            <Button onClick={() => {
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
                  navigate(`/book/${service_type}/schedule?family=${familyCount}&food=${foodPreference}&price=${price}`);
                } else if (service_type === 'maid') {
                  if (!selectedFlatSize || !selectedTasks) {
                    toast({
                      title: "Please complete maid booking details",
                      description: "Select flat size and a task before scheduling.",
                      variant: "destructive"
                    });
                    return;
                  }
                  const price = totalPrice;
                  navigate(`/book/${service_type}/schedule?flat=${selectedFlatSize}&tasks=${selectedTasks}&price=${price}`);
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
              }} disabled={service_type === 'cook' ? !foodPreference : service_type === 'maid' ? !selectedFlatSize || !selectedTasks : !selectedFlatSize} className="w-full h-14 rounded-full font-semibold text-lg bg-pink-500 hover:bg-pink-600 text-white border-0">
              <span>Prebook Now</span>
              <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
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