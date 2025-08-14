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
import { Clock, Calendar } from 'lucide-react';

interface ChooseTypeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType: 'maid' | 'cook' | 'bathroom_cleaning';
}

const serviceLabels = {
  maid: 'Maid Service',
  cook: 'Cook Service', 
  bathroom_cleaning: 'Bathroom Cleaning'
};

export function ChooseTypeSheet({ open, onOpenChange, serviceType }: ChooseTypeSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();

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
        </div>
      </SheetContent>
    </Sheet>
  );
}