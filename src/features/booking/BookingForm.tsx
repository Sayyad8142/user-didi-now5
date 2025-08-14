import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Home, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { 
  prettyServiceName, 
  serviceIcon, 
  isValidServiceType, 
  getPricingMap, 
  FLAT_SIZES,
  type FlatSize,
  type PricingMap 
} from './pricing';
import { ScheduleSheet } from './ScheduleSheet';

export function BookingForm() {
  const { service_type } = useParams<{ service_type: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { toast } = useToast();

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
        variant: "destructive",
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
        variant: "destructive",
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
        variant: "destructive",
      });
      return;
    }

    await createBooking('scheduled', date.toISOString().split('T')[0], time, price);
  };

  const createBooking = async (
    bookingType: 'instant' | 'scheduled',
    scheduledDate: string | null,
    scheduledTime: string | null,
    price: number
  ) => {
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
        flat_no: profile.flat_no,
      };

      const { error } = await supabase
        .from('bookings')
        .insert([bookingData]);

      if (error) {
        console.error('Booking error:', error);
        toast({
          title: "Booking Failed",
          description: "There was an error creating your booking. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Booking received!",
        description: bookingType === 'instant' 
          ? "Service will arrive in 10 minutes."
          : "Your booking has been scheduled successfully.",
      });

      setScheduleSheetOpen(false);
      navigate('/bookings');
    } catch (err) {
      console.error('Booking error:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !service_type || !isValidServiceType(service_type)) {
    return null;
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const ServiceIcon = serviceIcon(service_type);
  const currentPrice = selectedFlatSize ? pricingMap[selectedFlatSize] : null;
  const canBook = selectedFlatSize && currentPrice && !submitting;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/home')}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-primary">
            Book {prettyServiceName(service_type)} Service
          </h1>
          <div className="w-9"></div>
        </div>

        {/* Profile Summary Card */}
        {profile && (
          <Card className="mb-6 border-pink-50 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Community</span>
                  </div>
                  <span className="text-sm font-medium">{profile.community}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Flat Number</span>
                  </div>
                  <span className="text-sm font-medium">{profile.flat_no}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flat Size Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Flat Size *</h2>
          <div className="grid grid-cols-3 gap-3">
            {FLAT_SIZES.map((size) => (
              <Button
                key={size}
                variant={selectedFlatSize === size ? "default" : "outline"}
                onClick={() => setSelectedFlatSize(size)}
                className={`h-12 rounded-2xl transition-all ${
                  selectedFlatSize === size 
                    ? "border-2 border-primary text-primary-foreground shadow-lg" 
                    : "border border-gray-200 hover:border-primary/50"
                }`}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Price Panel */}
        <Card className="mb-6 bg-gradient-to-r from-pink-50 to-pink-100 border-pink-200 rounded-2xl">
          <CardContent className="p-6 text-center">
            {loadingPricing ? (
              <Skeleton className="h-8 w-24 mx-auto" />
            ) : (
              <div className="text-2xl font-bold text-primary">
                Price: ₹{currentPrice || '—'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Info */}
        <div className="flex items-center justify-center gap-2 mb-8 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-sm">Service arrives in 10 minutes</span>
        </div>

        {/* Action Buttons */}
        <div className="fixed bottom-20 left-0 right-0 px-4">
          <div className="max-w-md mx-auto flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setScheduleSheetOpen(true)}
              disabled={!canBook}
              className="flex-1 h-12 rounded-full border border-gray-200"
            >
              Schedule for Later
            </Button>
            <Button
              onClick={handleBookNow}
              disabled={!canBook}
              className="flex-1 h-12 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] hover:opacity-90"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Booking...
                </div>
              ) : (
                "Book Now"
              )}
            </Button>
          </div>
        </div>

        {/* Schedule Sheet */}
        <ScheduleSheet
          open={scheduleSheetOpen}
          onOpenChange={setScheduleSheetOpen}
          onSchedule={handleSchedule}
          loading={submitting}
        />
      </div>
    </div>
  );
}