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
      <div className="min-h-screen bg-white pb-24">
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
    <div className="min-h-screen bg-white pb-24">
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
          <h1 className="text-xl font-semibold" style={{color: '#ff007a'}}>
            Book {prettyServiceName(service_type)} Service
          </h1>
          <div className="w-9"></div>
        </div>

        {/* Profile Summary Card */}
        {profile && (
          <Card className="mb-6 bg-white rounded-2xl shadow-lg border border-pink-50">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" style={{color: '#ff007a'}} />
                    <span className="text-sm font-medium">Community</span>
                  </div>
                  <span className="text-sm font-bold">{profile.community}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4" style={{color: '#ff007a'}} />
                    <span className="text-sm font-medium">Flat Number</span>
                  </div>
                  <span className="text-sm font-bold">{profile.flat_no}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flat Size Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Flat Size *</h2>
          <div className="grid grid-cols-3 gap-3">
            {FLAT_SIZES.slice(0, 3).map((size) => (
              <Button
                key={size}
                variant="outline"
                onClick={() => setSelectedFlatSize(size)}
                className={`h-12 min-w-[96px] font-medium rounded-xl border transition-all ${
                  selectedFlatSize === size 
                    ? "border-2 shadow" 
                    : "border-gray-200 hover:border-gray-300"
                }`}
                style={selectedFlatSize === size ? {
                  borderColor: '#ff007a',
                  color: '#ff007a'
                } : {}}
              >
                {size}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {FLAT_SIZES.slice(3).map((size) => (
              <Button
                key={size}
                variant="outline"
                onClick={() => setSelectedFlatSize(size)}
                className={`h-12 min-w-[96px] font-medium rounded-xl border transition-all ${
                  selectedFlatSize === size 
                    ? "border-2 shadow" 
                    : "border-gray-200 hover:border-gray-300"
                }`}
                style={selectedFlatSize === size ? {
                  borderColor: '#ff007a',
                  color: '#ff007a'
                } : {}}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Price Panel */}
        <Card className="mb-6 rounded-2xl shadow-sm" style={{background: 'linear-gradient(135deg, #ffd1ec 0%, #ffb3d6 100%)'}}>
          <CardContent className="p-4 text-center">
            {loadingPricing ? (
              <Skeleton className="h-8 w-24 mx-auto" />
            ) : (
              <div className="text-2xl font-extrabold" style={{color: '#ff007a'}}>
                Price: ₹{currentPrice || '—'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Info */}
        <div className="flex items-center justify-center gap-2 mb-6 text-gray-500">
          <Clock className="w-4 h-4" />
          <span className="text-sm">Service arrives in 10 minutes</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-6 mt-6">
          {/* Book Now Button */}
          <Button
            onClick={handleBookNow}
            disabled={!canBook}
            className="w-full h-12 rounded-full text-white font-semibold"
            style={{background: 'linear-gradient(to right, #ff007a, #d9006a)'}}
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

          {/* Schedule Section */}
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">Schedule your slot for later</h3>
                <p className="text-gray-600">Guaranteed on-time service by our trusted Experts</p>
              </div>
              <div className="flex-shrink-0 ml-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center relative">
                  <Calendar className="w-8 h-8 text-blue-600" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-full flex items-center justify-center">
                      ✓
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <Button
              onClick={() => setScheduleSheetOpen(true)}
              disabled={!canBook}
              className="w-full h-14 rounded-2xl text-white font-semibold text-lg flex items-center justify-center gap-3"
              style={{background: 'linear-gradient(to right, #ff007a, #d9006a)'}}
            >
              Prebook Now
              <ArrowLeft className="w-5 h-5 rotate-180" />
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