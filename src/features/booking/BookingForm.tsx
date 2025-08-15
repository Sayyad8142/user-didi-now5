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
  return <div className="min-h-screen gradient-bg pb-32 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-primary/15 to-transparent rounded-full blur-3xl transform translate-x-24 -translate-y-24" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-primary-glow/20 to-transparent rounded-full blur-3xl transform -translate-x-16 translate-y-16" />
      </div>

      <div className="max-w-sm mx-auto px-3 py-4 relative z-10">
        {/* Mobile-Optimized Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/home')} 
              className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-spring shadow-card border border-white/30 active:scale-95"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
            <div className="w-10"></div>
          </div>
          
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-4 gradient-primary rounded-3xl flex items-center justify-center shadow-button">
              <ServiceIcon className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-black text-foreground mb-2 leading-tight">
              {prettyServiceName(service_type)}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">Premium Home Service</p>
          </div>
        </div>

        {/* Mobile Location Card */}
        {profile && (
          <Card className="mb-6 gradient-card rounded-2xl shadow-card border border-white/30 backdrop-blur-sm active:scale-[0.99] transition-spring">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 gradient-primary rounded-2xl flex items-center justify-center shadow-button">
                  <MapPin className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Service Address</h3>
                  <p className="text-xs text-muted-foreground">Your delivery location</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/50 rounded-xl backdrop-blur-sm">
                  <span className="font-semibold text-foreground text-sm">Community</span>
                  <span className="font-bold text-primary bg-primary/15 px-3 py-1.5 rounded-xl text-sm">
                    {profile.community}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white/50 rounded-xl backdrop-blur-sm">
                  <span className="font-semibold text-foreground text-sm">Flat No.</span>
                  <span className="font-bold text-primary bg-primary/15 px-3 py-1.5 rounded-xl text-sm">
                    {profile.flat_no}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile Flat Size Selection */}
        <Card className="mb-6 gradient-card rounded-2xl shadow-card border border-white/30 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-foreground mb-2">Select Flat Size</h2>
              <p className="text-sm text-muted-foreground">Choose your space size</p>
            </div>
            
            <div className="grid grid-cols-3 gap-2.5 mb-3">
              {FLAT_SIZES.slice(0, 3).map(size => (
                <Button 
                  key={size} 
                  variant="outline" 
                  onClick={() => setSelectedFlatSize(size)} 
                  className={`h-14 font-bold rounded-2xl border-2 transition-spring active:scale-95 backdrop-blur-sm relative overflow-hidden text-sm ${
                    selectedFlatSize === size 
                      ? "border-primary bg-primary/20 text-primary shadow-button" 
                      : "border-white/40 bg-white/20 active:border-primary/50 active:bg-primary/10"
                  }`}
                >
                  {selectedFlatSize === size && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
                  )}
                  <span className="relative z-10">{size}</span>
                </Button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-2.5">
              {FLAT_SIZES.slice(3).map(size => (
                <Button 
                  key={size} 
                  variant="outline" 
                  onClick={() => setSelectedFlatSize(size)} 
                  className={`h-14 font-bold rounded-2xl border-2 transition-spring active:scale-95 backdrop-blur-sm relative overflow-hidden text-sm ${
                    selectedFlatSize === size 
                      ? "border-primary bg-primary/20 text-primary shadow-button" 
                      : "border-white/40 bg-white/20 active:border-primary/50 active:bg-primary/10"
                  }`}
                >
                  {selectedFlatSize === size && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
                  )}
                  <span className="relative z-10">{size}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mobile Price Display */}
        <Card className="mb-6 gradient-primary rounded-2xl shadow-button transition-spring active:scale-[0.99] overflow-hidden relative">
          <CardContent className="p-6 text-center relative">
            <div className="flex items-center justify-center gap-4 mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">₹</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary-foreground">Total Price</h3>
                <p className="text-xs text-primary-foreground/70">All inclusive</p>
              </div>
            </div>
            
            {loadingPricing ? (
              <Skeleton className="h-10 w-28 mx-auto bg-white/20 rounded-xl" />
            ) : (
              <div className="text-3xl font-black text-primary-foreground">
                ₹{currentPrice || '—'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile Service Info */}
        <div className="flex items-center justify-center gap-3 mb-6 bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-card">
          <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-button">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">Quick Service</p>
            <p className="text-xs text-muted-foreground">Arrives in 10 minutes</p>
          </div>
        </div>

        {/* Mobile Action Buttons */}
        <div className="space-y-4 mt-8">
          {/* Mobile Book Now Button */}
          <Button 
            onClick={handleBookNow} 
            disabled={!canBook} 
            className="w-full h-16 rounded-2xl text-primary-foreground font-bold text-lg gradient-primary shadow-button active:scale-95 transition-spring disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
          >
            <div className="flex items-center justify-center gap-3">
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Booking...</span>
                </>
              ) : (
                <>
                  <span>Book Now - Instant Service</span>
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </div>
                </>
              )}
            </div>
          </Button>

          {/* Mobile Schedule Card */}
          <Card className="gradient-card rounded-2xl shadow-card border border-white/30 backdrop-blur-sm transition-spring active:scale-[0.99]">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center shadow-button">
                  <Calendar className="w-8 h-8 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-1">
                    Schedule Later
                  </h3>
                  <p className="text-sm text-muted-foreground">Choose your time</p>
                </div>
              </div>
              
              <Button 
                onClick={() => setScheduleSheetOpen(true)} 
                disabled={!canBook} 
                className="w-full h-14 rounded-2xl text-primary-foreground font-bold gradient-primary shadow-button active:scale-95 transition-spring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-center gap-3">
                  <span>Prebook Service</span>
                  <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                    <ArrowLeft className="w-3 h-3 rotate-180" />
                  </div>
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Schedule Sheet */}
        <ScheduleSheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen} onSchedule={handleSchedule} loading={submitting} />
      </div>
    </div>;
}