import React, { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (date: Date, time: string) => void;
  loading?: boolean;
}

const TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00'
];

// Check if time slot is between 3PM (15:00) and 7PM (19:00)
const isLimitedAvailabilitySlot = (time: string): boolean => {
  const [hours] = time.split(':').map(Number);
  return hours >= 15 && hours <= 19;
};

export function ScheduleSheet({ open, onOpenChange, onSchedule, loading }: ScheduleSheetProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showAvailabilityWarning, setShowAvailabilityWarning] = useState(false);

  const handleSchedule = () => {
    if (selectedDate && selectedTime) {
      onSchedule(selectedDate, selectedTime);
    }
  };

  const canSchedule = selectedDate && selectedTime && !loading;

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
            <label className="text-sm font-medium text-gray-700">
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
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Select Time * (6 AM - 7 PM)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TIME_OPTIONS.map((time) => (
                  <Button
                    key={time}
                    variant={selectedTime === time ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedTime(time);
                      if (isLimitedAvailabilitySlot(time)) {
                        setShowAvailabilityWarning(true);
                      }
                    }}
                    className={cn(
                    "rounded-lg text-xs",
                    selectedTime === time && "bg-primary text-white"
                  )}
                >
                  {time}
                </Button>
              ))}
            </div>
          </div>
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

        {/* Limited Availability Warning Dialog */}
        <AlertDialog open={showAvailabilityWarning} onOpenChange={setShowAvailabilityWarning}>
          <AlertDialogContent className="max-w-sm rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-foreground">
                Note
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground space-y-3">
                <p>
                  Between 3:00 PM and 7:00 PM, worker availability is limited.
                  There is a lower chance of maid confirmation during these hours.
                </p>
                <p className="font-medium text-foreground">
                  For 100% booking confirmation, we recommend booking between 6:00 AM and 3:00 PM.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction className="w-full rounded-full bg-primary">
                Agree & Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}