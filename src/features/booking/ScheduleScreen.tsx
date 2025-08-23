import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Home, MapPin, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { prettyServiceName, isValidServiceType, getPricingMap, calculateCookPrice } from './pricing';
import { 
  makeSlots, 
  toDisplay12h, 
  isPastToday, 
  getDateChips, 
  getExtraCharge,
  TIME_SEGMENTS, 
  type TimeSegment 
} from './slot-utils';
import { format } from 'date-fns';

export function ScheduleScreen() {
  const { service_type } = useParams<{ service_type: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [activeSegment, setActiveSegment] = useState<TimeSegment>('Morning');
  const [submitting, setSubmitting] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  const flatSize = searchParams.get('flat');
  const priceParam = searchParams.get('price');
  const familyCount = searchParams.get('family');
  const foodPreference = searchParams.get('food') as 'veg' | 'non_veg' | null;
  const cuisinePref = searchParams.get('cuisine') as 'north' | 'south' | 'any' | null;
  const genderPref = searchParams.get('gender') as 'male' | 'female' | 'any' | null;
  const bathroomCount = searchParams.get('bathrooms');

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
    if (priceParam) {
      setPrice(parseInt(priceParam));
    } else if (service_type === 'cook' && familyCount && foodPreference) {
      setPrice(calculateCookPrice(parseInt(familyCount), foodPreference));
    } else if (profile && service_type && flatSize) {
      loadPrice();
    }
  }, [profile, service_type, flatSize, priceParam, familyCount, foodPreference]);

  const loadPrice = async () => {
    if (!service_type || !profile || !flatSize) return;
    
    try {
      const pricing = await getPricingMap(service_type, profile.community);
      const flatPrice = pricing[flatSize];
      if (flatPrice) {
        setPrice(flatPrice);
      }
    } catch (error) {
      console.error('Error loading price:', error);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!selectedDate || !selectedTime || !profile || !user || !service_type || !price) {
      return;
    }
    if (service_type !== 'cook' && service_type !== 'bathroom_cleaning' && !flatSize) return;
    if (service_type === 'bathroom_cleaning' && !bathroomCount) return;
    if (service_type === 'cook' && (!familyCount || !foodPreference)) return;

    setSubmitting(true);
    try {
      const scheduledDate = format(selectedDate, 'yyyy-MM-dd');
      const scheduledTime = `${selectedTime}:00`;

      const bookingData = {
        user_id: user.id,
        service_type,
        booking_type: 'scheduled',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'cook' || service_type === 'bathroom_cleaning' ? null : flatSize,
        family_count: service_type === 'cook' ? parseInt(familyCount!) : null,
        food_pref: service_type === 'cook' ? foodPreference : null,
        cook_cuisine_pref: service_type === 'cook' ? (cuisinePref || 'any') : null,
        cook_gender_pref: service_type === 'cook' ? (genderPref || 'any') : null,
        bathroom_count: service_type === 'bathroom_cleaning' ? parseInt(bathroomCount!) : null,
        price_inr: price,
        cust_name: profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no
      };

      const { error } = await supabase
        .from('bookings')
        .insert([bookingData]);

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
        title: "Schedule confirmed!",
        description: "Your booking has been scheduled successfully."
      });

      navigate('/home');
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
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-6">
            <Skeleton className="h-14 w-full rounded-3xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (service_type !== 'cook' && service_type !== 'bathroom_cleaning' && !flatSize) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/book/${service_type}`)} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold text-foreground ml-4">
              Schedule {prettyServiceName(service_type)}
            </h1>
          </div>
          
          <Card className="bg-yellow-50 border-yellow-200 rounded-2xl">
            <CardContent className="p-4">
              <p className="text-yellow-800 font-medium">
                {service_type === 'cook' 
                  ? 'Select family count and food preference first'
                  : service_type === 'bathroom_cleaning'
                  ? 'Select bathroom count first'
                  : 'Select flat size first'}
              </p>
              <Button 
                variant="link" 
                onClick={() => navigate(`/book/${service_type}`)}
                className="text-yellow-600 p-0 h-auto"
              >
                Go back to booking form
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const dateChips = getDateChips();
  const currentSegmentSlots = makeSlots(
    TIME_SEGMENTS[activeSegment].start,
    TIME_SEGMENTS[activeSegment].end
  );

  const canConfirm = selectedDate && selectedTime && !submitting;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-3 py-4 pb-24">
        {/* Header */}
        <div className="flex items-center mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/book/${service_type}`)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground ml-2">
            Schedule {prettyServiceName(service_type)}
          </h1>
        </div>

        <div className="space-y-4">
          {/* Date Selection */}
          <Card className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <h2 className="text-base font-semibold text-foreground mb-3">
              Select date of service
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {dateChips.slice(0, 4).map((chip, index) => (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => {
                    setSelectedDate(chip.date);
                    setSelectedTime(''); // Reset time when date changes
                  }}
                  className={`rounded-xl px-3 py-4 h-auto border-2 whitespace-nowrap flex-shrink-0 flex flex-col items-center gap-0.5 min-w-[70px] ${
                    selectedDate.toDateString() === chip.date.toDateString()
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="text-xs font-semibold">{chip.label}</span>
                  <span className="text-lg font-bold">{chip.dayLabel}</span>
                </Button>
              ))}
            </div>
          </Card>

          {/* Time Selection */}
          <Card className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <h2 className="text-base font-semibold text-foreground mb-3">
              Select start time of service
            </h2>
            
            <Tabs value={activeSegment} onValueChange={(value) => {
              setActiveSegment(value as TimeSegment);
              setSelectedTime(''); // Reset time when segment changes
            }}>
              <TabsList className="grid w-full grid-cols-3 mb-3 bg-gray-100 rounded-xl p-0.5 h-9">
                <TabsTrigger value="Morning" className="rounded-lg text-xs">Morning</TabsTrigger>
                <TabsTrigger value="Afternoon" className="rounded-lg text-xs">Afternoon</TabsTrigger>
                <TabsTrigger value="Evening" className="rounded-lg text-xs">Evening</TabsTrigger>
              </TabsList>

              <TabsContent value={activeSegment} className="mt-0">
                <div className="grid grid-cols-3 gap-2">
                  {currentSegmentSlots.map((slot) => {
                    const isPast = isPastToday(slot, selectedDate);
                    const isSelected = selectedTime === slot;
                    
                    return (
                      <Button
                        key={slot}
                        variant="outline"
                        disabled={isPast}
                        onClick={() => setSelectedTime(slot)}
                        className={`relative rounded-xl border-2 h-12 px-2 text-xs flex flex-col items-center justify-center ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : isPast
                            ? 'border-gray-200 text-gray-400 bg-gray-50'
                            : 'border-gray-200 bg-white text-foreground hover:border-primary/50'
                        }`}
                      >
                        <span className="font-medium">{toDisplay12h(slot)}</span>
                      </Button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-6">
        <div className="max-w-md mx-auto">
          <Button
            onClick={handleConfirmSchedule}
            disabled={!canConfirm}
            className="w-full h-12 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] text-white font-semibold text-sm disabled:opacity-50"
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Confirming...</span>
              </div>
            ) : (
              'Confirm Schedule'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}