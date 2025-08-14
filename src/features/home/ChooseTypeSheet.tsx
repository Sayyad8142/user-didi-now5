import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Clock, Calendar } from 'lucide-react';

interface ChooseTypeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  service: 'maid' | 'cook' | 'bathroom_cleaning' | null;
}

const serviceLabels = {
  maid: 'Maid Service',
  cook: 'Cook Service', 
  bathroom_cleaning: 'Bathroom Cleaning'
};

export function ChooseTypeSheet({ isOpen, onClose, service }: ChooseTypeSheetProps) {
  const [selectedType, setSelectedType] = useState<'instant' | 'scheduled' | null>(null);
  const navigate = useNavigate();

  const handleContinue = () => {
    if (selectedType && service) {
      navigate(`/book/${service}?type=${selectedType}`);
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedType(null);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center">How would you like to book?</SheetTitle>
          <SheetDescription className="text-center">
            {service && serviceLabels[service]}
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-3 pb-6">
          <button
            onClick={() => setSelectedType('instant')}
            className={`w-full p-4 rounded-2xl border-2 transition-colors ${
              selectedType === 'instant'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-background hover:bg-accent'
            }`}
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

          <button
            onClick={() => setSelectedType('scheduled')}
            className={`w-full p-4 rounded-2xl border-2 transition-colors ${
              selectedType === 'scheduled'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-background hover:bg-accent'
            }`}
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
        </div>

        <Button
          onClick={handleContinue}
          disabled={!selectedType}
          className="w-full rounded-full h-11 bg-gradient-primary text-white font-semibold"
        >
          Continue
        </Button>
      </SheetContent>
    </Sheet>
  );
}