import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { prettyServiceName, serviceIcon, isValidServiceType } from './utils';
import { useToast } from '@/hooks/use-toast';

export function BookingForm() {
  const { service_type } = useParams<{ service_type: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { toast } = useToast();

  const [bookingType, setBookingType] = useState<'instant' | 'scheduled'>(
    (searchParams.get('type') as 'instant' | 'scheduled') || 'instant'
  );
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!profileLoading && !profile) {
      navigate('/auth');
    }
  }, [profile, profileLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile || !service_type || !user) return;
    
    // Validation
    if (bookingType === 'scheduled' && (!selectedDate || !selectedTime)) {
      toast({
        title: "Missing Information",
        description: "Please select both date and time for scheduled booking.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const bookingData = {
        user_id: user.id,
        service_type,
        booking_type: bookingType,
        scheduled_date: bookingType === 'scheduled' ? selectedDate?.toISOString().split('T')[0] : null,
        scheduled_time: bookingType === 'scheduled' ? selectedTime : null,
        notes: notes.trim() || null,
        status: 'pending',
        cust_name: profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
      };

      const { error } = await supabase
        .from('bookings')
        .insert(bookingData);

      if (error) {
        console.error('Error creating booking:', error);
        toast({
          title: "Booking Failed",
          description: "Couldn't create booking. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Booking Received!",
        description: "We'll confirm your booking soon.",
      });
      
      navigate('/bookings');
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!profile || !service_type) {
    return null;
  }

  const ServiceIcon = serviceIcon(service_type);

  // Generate time options (6AM to 7PM)
  const timeOptions = [];
  for (let hour = 6; hour <= 19; hour++) {
    for (let minute of ['00', '30']) {
      const time24 = `${hour.toString().padStart(2, '0')}:${minute}`;
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const period = hour >= 12 ? 'PM' : 'AM';
      const timeLabel = `${hour12}:${minute} ${period}`;
      timeOptions.push({ value: time24, label: timeLabel });
    }
  }

  return (
    <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-primary">
            Book {prettyServiceName(service_type)}
          </h1>
        </div>

        {/* Summary Card */}
        <Card className="shadow-card border-pink-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center">
                <ServiceIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{prettyServiceName(service_type)}</p>
                <p className="text-sm text-muted-foreground">
                  {profile.community} · {profile.flat_no}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-pink-50">
              <Phone className="w-4 h-4" />
              <span>Support: </span>
              <a href="tel:+918008180018" className="text-primary font-medium">
                +91 800 818 0018
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Booking Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="shadow-card border-pink-50">
            <CardContent className="p-4 space-y-4">
              {/* Booking Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Booking Type</Label>
                <ToggleGroup 
                  type="single" 
                  value={bookingType} 
                  onValueChange={(value) => value && setBookingType(value as 'instant' | 'scheduled')}
                  className="grid grid-cols-2 gap-2"
                >
                  <ToggleGroupItem 
                    value="instant" 
                    className="data-[state=on]:bg-primary data-[state=on]:text-white"
                  >
                    Instant
                  </ToggleGroupItem>
                  <ToggleGroupItem 
                    value="scheduled"
                    className="data-[state=on]:bg-primary data-[state=on]:text-white"
                  >
                    Schedule
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Date & Time (only for scheduled) */}
              {bookingType === 'scheduled' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Time</Label>
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Select time</option>
                      {timeOptions.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes (Optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions..."
                  className="min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] text-white font-semibold"
          >
            {isSubmitting ? 'Creating Booking...' : 'Confirm Booking'}
          </Button>
        </form>
      </div>
    </div>
  );
}