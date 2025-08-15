import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Home, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { prettyServiceName, serviceIcon, isValidServiceType, getPricingMap, FLAT_SIZES, type FlatSize, type PricingMap, calculateCookPrice } from './pricing';
import { ScheduleSheet } from './ScheduleSheet';
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
    if (profile && service_type && service_type !== 'cook') {
      loadPricing();
    } else if (service_type === 'cook') {
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
  const currentPrice = service_type === 'cook' 
    ? (foodPreference ? calculateCookPrice(familyCount, foodPreference) : null)
    : (selectedFlatSize ? pricingMap[selectedFlatSize] : null);
  const canBook = service_type === 'cook' 
    ? (foodPreference && !submitting)
    : (selectedFlatSize && currentPrice && !submitting);
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
          {profile && service_type === 'cook' && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-[#ff007a] mb-4">
                Booking Details
              </h2>
              <Card className="border border-pink-100 rounded-2xl shadow-sm bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-[#ff007a]" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-foreground font-medium">Community</span>
                      <span className="text-foreground font-bold">{profile.community}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Home className="w-5 h-5 text-[#ff007a]" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-foreground font-medium">Flat Number</span>
                      <span className="text-foreground font-bold">{profile.flat_no}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Community & Flat Cards for other services */}
          {profile && service_type !== 'cook' && (
            <>
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
            </>
          )}

          {/* Cook Service Controls */}
          {service_type === 'cook' && (
            <>
              {/* Family Count */}
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  Number of Family Members <span className="text-destructive">*</span>
                </h2>
                <div className="flex items-center justify-center gap-4">
                  <Button 
                    variant="outline" 
                    className="h-10 w-10 rounded-xl border-2" 
                    onClick={() => setFamilyCount(Math.max(1, familyCount - 1))} 
                    disabled={familyCount <= 1}
                  >
                    –
                  </Button>
                  <div className="w-10 text-center text-xl font-semibold">{familyCount}</div>
                  <Button 
                    variant="outline" 
                    className="h-10 w-10 rounded-xl border-2" 
                    onClick={() => setFamilyCount(Math.min(20, familyCount + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Food Preference */}
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  Food Preference <span className="text-destructive">*</span>
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFoodPreference('veg')}
                    className={`h-12 rounded-xl border px-4 flex items-center justify-center gap-2 ${
                      foodPreference === 'veg'
                        ? 'border-2 border-[#ff007a] text-[#ff007a] shadow'
                        : 'border border-gray-300 text-foreground hover:border-[#ff007a]/50'
                    }`}
                  >
                    <span>🥬</span>
                    <span className="font-medium">Vegetarian</span>
                  </button>
                  <button
                    onClick={() => setFoodPreference('non_veg')}
                    className={`h-12 rounded-xl border px-4 flex items-center justify-center gap-2 ${
                      foodPreference === 'non_veg'
                        ? 'border-2 border-[#ff007a] text-[#ff007a] shadow'
                        : 'border border-gray-300 text-foreground hover:border-[#ff007a]/50'
                    }`}
                  >
                    <span>🍗</span>
                    <span className="font-medium">Non-Vegetarian</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Select Flat Size for other services */}
          {service_type !== 'cook' && (
            <div className="mt-8">
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
            </div>
          )}

          {/* Price Display */}
          {((service_type === 'cook' && foodPreference) || (service_type !== 'cook' && selectedFlatSize)) && (
            <Card className="bg-gradient-to-r from-pink-100 to-pink-200 border-pink-200 rounded-2xl mt-6">
              <CardContent className="p-4">
                <div className="text-center">
                  {loadingPricing ? (
                    <Skeleton className="h-8 w-32 mx-auto rounded-lg" />
                  ) : (
                    <span className="text-2xl font-extrabold text-[#ff007a]">
                      Price: ₹{currentPrice}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-4 mt-8">
            <Button 
              onClick={handleBookNow} 
              disabled={!canBook} 
              className="w-full h-14 rounded-full font-semibold text-lg bg-pink-500 hover:bg-pink-600 text-white border-0"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Booking...</span>
                </div>
              ) : (
                "Book Now - Instant Service"
              )}
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
                  navigate(`/book/${service_type}/schedule?family=${familyCount}&food=${foodPreference}&price=${price}`);
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
              disabled={service_type === 'cook' ? !foodPreference : !selectedFlatSize} 
              className="w-full h-14 rounded-full font-semibold text-lg bg-pink-500 hover:bg-pink-600 text-white border-0"
            >
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