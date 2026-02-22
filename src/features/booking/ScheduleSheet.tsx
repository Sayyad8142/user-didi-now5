import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface ScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (date: Date, time: string) => void;
  loading?: boolean;
  serviceType?: string;
  community?: string;
}

type SlotAvailability = { slot_time: string; worker_count: number };

export function ScheduleSheet({ open, onOpenChange, onSchedule, loading, serviceType, community }: ScheduleSheetProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [slotData, setSlotData] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Fetch slot availability when date changes
  useEffect(() => {
    if (!selectedDate || !community || !serviceType) {
      setSlotData([]);
      return;
    }

    const fetchAvailability = async () => {
      setLoadingSlots(true);
      setSelectedTime(''); // reset time on date change
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data, error } = await supabase.rpc('get_scheduled_slot_availability', {
          p_community: community,
          p_service_type: serviceType,
          p_date: dateStr,
        });
        if (error) {
          console.error('Slot availability error:', error);
          setSlotData([]);
        } else {
          setSlotData((data as SlotAvailability[]) || []);
        }
      } catch (err) {
        console.error('Slot availability fetch failed:', err);
        setSlotData([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, community, serviceType]);

  const handleSchedule = () => {
    if (selectedDate && selectedTime) {
      onSchedule(selectedDate, selectedTime);
    }
  };

  const canSchedule = selectedDate && selectedTime && !loading;
  const allUnavailable = selectedDate && !loadingSlots && slotData.length > 0 && slotData.every(s => s.worker_count === 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-center pb-6">
          <SheetTitle className="text-xl font-semibold text-primary">
            Schedule Your Service
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Date Picker */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              Select Date *
            </label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-12 rounded-xl",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-3 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setDatePickerOpen(false);
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          {selectedDate && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  Select Time *
                </label>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Slots update based on worker availability for the selected day.</p>

              {loadingSlots ? (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : allUnavailable ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No workers available for this day.
                  </p>
                  <p className="text-xs text-muted-foreground">Try another date.</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {slotData.map((slot) => {
                    const isUnavailable = slot.worker_count === 0;
                    const isSelected = selectedTime === slot.slot_time;
                    return (
                      <Button
                        key={slot.slot_time}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        disabled={isUnavailable}
                        onClick={() => {
                          if (!isUnavailable) setSelectedTime(slot.slot_time);
                        }}
                        className={cn(
                          "rounded-lg text-xs flex flex-col h-auto py-1.5 gap-0",
                          isSelected && "bg-primary text-primary-foreground",
                          isUnavailable && "opacity-40 line-through cursor-not-allowed"
                        )}
                      >
                        <span>{slot.slot_time}</span>
                        {isUnavailable && (
                          <span className="text-[9px] leading-none text-destructive font-normal no-underline" style={{ textDecoration: 'none' }}>
                            N/A
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="flex-1 h-12 rounded-full"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={!canSchedule}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d9006a] hover:opacity-90"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scheduling...
              </div>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Schedule Booking
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
