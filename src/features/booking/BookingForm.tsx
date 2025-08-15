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
import { prettyServiceName, serviceIcon, isValidServiceType, getPricingMap, FLAT_SIZES, type FlatSize, type PricingMap } from './pricing';
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
    if (profile && service_type) {
      loadPricing();
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
    if (!selectedFlatSize || !profile || !service_type) return;
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
  };
  const handleSchedule = async (date: Date, time: string) => {
    if (!selectedFlatSize || !profile || !service_type) return;
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
  };
  const createBooking = async (bookingType: 'instant' | 'scheduled', scheduledDate: string | null, scheduledTime: string | null, price: number) => {
    if (!profile || !user || !service_type || !selectedFlatSize) return;
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
        flat_size: selectedFlatSize,
        price_inr: price,
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
  const currentPrice = selectedFlatSize ? pricingMap[selectedFlatSize] : null;
  const canBook = selectedFlatSize && currentPrice && !submitting;
  return <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Community Card */}
          {profile && <Card className="border border-border rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-primary" />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-foreground font-medium">Community</span>
                    <span className="text-foreground font-semibold">{profile.community}</span>
                  </div>
                </div>
              </CardContent>
            </Card>}

          {/* Flat Number Card */}
          {profile && <Card className="border border-border rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Home className="w-5 h-5 text-primary" />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-foreground font-medium">Flat Number</span>
                    <span className="text-foreground font-semibold">{profile.flat_no}</span>
                  </div>
                </div>
              </CardContent>
            </Card>}

          {/* Select Flat Size */}
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

          {/* Price Display */}
          {selectedFlatSize && <Card className="bg-pink-100 border-pink-200 rounded-2xl mt-6">
              <CardContent className="p-6">
                <div className="text-center">
                  {loadingPricing ? <Skeleton className="h-8 w-32 mx-auto rounded-lg" /> : <span className="text-2xl font-bold text-pink-600">
                      Price: ₹{currentPrice}
                    </span>}
                </div>
              </CardContent>
            </Card>}

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
                  onClick={() => setScheduleSheetOpen(true)} 
                  disabled={!canBook} 
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