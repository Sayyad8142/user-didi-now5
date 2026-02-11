import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Clock, Calendar, AlertCircle } from 'lucide-react';
import { useInstantBookingAvailability } from '@/hooks/useInstantBookingAvailability';

interface ChooseTypeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType: 'maid' | 'bathroom_cleaning';
}

const serviceLabels = {
  maid: 'Maid Service',
  bathroom_cleaning: 'Bathroom Cleaning'
};

export function ChooseTypeSheet({ open, onOpenChange, serviceType }: ChooseTypeSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAvailable: instantAvailable, isLoading, isError } = useInstantBookingAvailability(serviceType);

  const normalize = (s: string) => s.replace(/\s+/g, '_').toLowerCase();

  const go = (type: 'instant' | 'scheduled') => {
    const key = normalize(serviceType);
    onOpenChange(false);
    navigate(`/book/${key}?type=${type}`, { replace: false });
  };

  // Auto-close if route changes to /book/*
  useEffect(() => {
    if (location.pathname.startsWith('/book/')) {
      onOpenChange(false);
    }
  }, [location, onOpenChange]);

  const instantDisabled = !instantAvailable || isError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center">How would you like to book?</SheetTitle>
          <SheetDescription className="text-center">
            {serviceLabels[serviceType]}
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-3 pb-6">
          {instantDisabled ? (
            <div className="w-full p-4 rounded-2xl border-2 border-border bg-muted/50 opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-muted-foreground">All workers are currently busy</h3>
                  <p className="text-sm text-muted-foreground">Schedule for later instead</p>
                </div>
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          ) : (
            <SheetClose asChild>
              <button
                onClick={() => go('instant')}
                className="w-full p-4 rounded-2xl border-2 border-border bg-background hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold">Instant</h3>
                    <p className="text-sm text-muted-foreground">Get help in ~10 mins</p>
                  </div>
                </div>
              </button>
            </SheetClose>
          )}

          <SheetClose asChild>
            <button
              onClick={() => go('scheduled')}
              className="w-full p-4 rounded-2xl border-2 border-border bg-background hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Schedule</h3>
                  <p className="text-sm text-muted-foreground">Pick date & time</p>
                </div>
              </div>
            </button>
          </SheetClose>

          {instantDisabled && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  {isError 
                    ? "Service temporarily unavailable. Please try again shortly."
                    : "All workers are busy in ongoing bookings. We'll be back shortly. You can also schedule the service for later."}
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
