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
  return <div className="min-h-screen gradient-bg pb-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl transform translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-primary-glow/30 to-transparent rounded-full blur-3xl transform -translate-x-24 translate-y-24" />
      </div>

      <div className="max-w-md mx-auto px-4 py-6 relative z-10">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between mb-10">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/home')} 
            className="p-4 rounded-3xl bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-spring shadow-card border border-white/30"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 gradient-primary rounded-3xl flex items-center justify-center shadow-button">
              <ServiceIcon className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {prettyServiceName(service_type)}
            </h1>
            <p className="text-sm text-muted-foreground">Premium Service</p>
          </div>
          <div className="w-12"></div>
        </div>

        {/* Enhanced Profile Card */}
        {profile && (
          <Card className="mb-8 gradient-card rounded-3xl shadow-card border border-white/30 backdrop-blur-sm hover:shadow-button transition-spring group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
            <CardContent className="p-8 relative">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 gradient-primary rounded-3xl flex items-center justify-center shadow-button">
                  <MapPin className="w-8 h-8 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Service Location</h3>
                  <p className="text-sm text-muted-foreground">Your registered address</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/40 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold text-foreground">Community</span>
                  </div>
                  <span className="font-bold text-primary bg-primary/10 px-4 py-2 rounded-2xl text-sm">
                    {profile.community}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-white/40 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
                      <Home className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold text-foreground">Flat Number</span>
                  </div>
                  <span className="font-bold text-primary bg-primary/10 px-4 py-2 rounded-2xl text-sm">
                    {profile.flat_no}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Flat Size Selection */}
        <Card className="mb-8 gradient-card rounded-3xl shadow-card border border-white/30 backdrop-blur-sm">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Choose Your Space</h2>
              <p className="text-muted-foreground">Select the size that matches your flat</p>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              {FLAT_SIZES.slice(0, 3).map(size => (
                <Button 
                  key={size} 
                  variant="outline" 
                  onClick={() => setSelectedFlatSize(size)} 
                  className={`h-16 font-bold rounded-3xl border-2 transition-spring hover:scale-105 backdrop-blur-sm relative overflow-hidden ${
                    selectedFlatSize === size 
                      ? "border-primary bg-primary/20 text-primary shadow-button" 
                      : "border-white/40 bg-white/20 hover:border-primary/50 hover:bg-primary/10"
                  }`}
                >
                  {selectedFlatSize === size && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
                  )}
                  <span className="relative z-10">{size}</span>
                </Button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {FLAT_SIZES.slice(3).map(size => (
                <Button 
                  key={size} 
                  variant="outline" 
                  onClick={() => setSelectedFlatSize(size)} 
                  className={`h-16 font-bold rounded-3xl border-2 transition-spring hover:scale-105 backdrop-blur-sm relative overflow-hidden ${
                    selectedFlatSize === size 
                      ? "border-primary bg-primary/20 text-primary shadow-button" 
                      : "border-white/40 bg-white/20 hover:border-primary/50 hover:bg-primary/10"
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

        {/* Enhanced Price Display */}
        <Card className="mb-8 gradient-primary rounded-3xl shadow-button hover:shadow-lg transition-spring group overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
          <CardContent className="p-8 text-center relative">
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-3xl flex items-center justify-center mb-4">
                <span className="text-2xl">₹</span>
              </div>
              <h3 className="text-lg font-semibold text-primary-foreground/80 mb-2">Service Price</h3>
            </div>
            
            {loadingPricing ? (
              <Skeleton className="h-12 w-32 mx-auto bg-white/20 rounded-2xl" />
            ) : (
              <div className="text-4xl font-extrabold text-primary-foreground mb-2">
                ₹{currentPrice || '—'}
              </div>
            )}
            <p className="text-primary-foreground/70 text-sm">All inclusive pricing</p>
          </CardContent>
        </Card>

        {/* Enhanced Service Info */}
        <Card className="mb-8 bg-white/30 backdrop-blur-md rounded-3xl border border-white/40 shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 gradient-primary rounded-2xl flex items-center justify-center shadow-button">
                <Clock className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="text-center">
                <p className="font-bold text-foreground text-lg">Quick Service</p>
                <p className="text-sm text-muted-foreground">Arrives in 10 minutes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Action Buttons */}
        <div className="space-y-6">
          {/* Enhanced Book Now Button */}
          <Button 
            onClick={handleBookNow} 
            disabled={!canBook} 
            className="w-full h-20 rounded-3xl text-primary-foreground font-bold text-xl gradient-primary shadow-button hover:shadow-lg hover:scale-[1.02] transition-spring disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
            <div className="relative z-10 flex items-center gap-4">
              {submitting ? (
                <>
                  <div className="w-6 h-6 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Booking...</span>
                </>
              ) : (
                <>
                  <span>Book Now</span>
                  <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center group-hover:bg-white/30 transition-smooth">
                    <ArrowLeft className="w-5 h-5 rotate-180 group-hover:translate-x-1 transition-smooth" />
                  </div>
                </>
              )}
            </div>
          </Button>

          {/* Enhanced Schedule Card */}
          <Card className="gradient-card rounded-3xl shadow-card border border-white/30 backdrop-blur-sm transition-smooth hover:shadow-button group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
            <CardContent className="p-8 relative">
              <div className="flex items-center gap-6 mb-6">
                <div className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center shadow-button group-hover:scale-105 transition-spring">
                  <Calendar className="w-10 h-10 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-primary transition-smooth">
                    Schedule Later
                  </h3>
                  <p className="text-muted-foreground">Choose your preferred time</p>
                </div>
              </div>
              
              <Button 
                onClick={() => setScheduleSheetOpen(true)} 
                disabled={!canBook} 
                className="w-full h-16 rounded-3xl text-primary-foreground font-bold text-lg gradient-primary shadow-button hover:shadow-lg hover:scale-[1.02] transition-spring flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
                <div className="relative z-10 flex items-center gap-4">
                  <span>Prebook Now</span>
                  <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full group-hover:bg-white/30 transition-smooth">
                    <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-0.5 transition-smooth" />
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