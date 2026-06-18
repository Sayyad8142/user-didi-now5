import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

export type IncludedServiceType = 'maid' | 'bathroom_cleaning' | 'cook' | 'dishwashing';

type ServiceDetails = {
  title: string;
  included: string[];
  notIncluded: string[];
};

const SERVICE_DETAILS: Record<IncludedServiceType, ServiceDetails> = {
  maid: {
    title: 'House Cleaning (Maid)',
    included: [
      'Sweeping',
      'Mopping',
      'Dusting furniture',
      'Bed arrangement',
      'Waste disposal',
    ],
    notIncluded: [
      'Moving heavy furniture',
      'Exterior cleaning',
      'Working at height',
      'Child or elderly care',
    ],
  },
  bathroom_cleaning: {
    title: 'Bathroom Cleaning',
    included: [
      'WC cleaning',
      'Sink cleaning',
      'Mirror cleaning',
      'Floor mopping',
      'Surface cleaning',
    ],
    notIncluded: [
      'Acid wash',
      'Drain unclogging',
      'Ceiling cleaning',
      'Electrical work',
    ],
  },
  dishwashing: {
    title: 'Dishwashing',
    included: [
      'Washing daily utensils',
      'Sink cleaning',
      'Stove wiping',
      'Kitchen waste disposal',
    ],
    notIncluded: [
      'Chimney cleaning',
      'Appliance cleaning',
      'Heavy grease removal',
      'Broken glass handling',
    ],
  },
  cook: {
    title: 'Cook Service',
    included: [
      'Meal preparation',
      'Basic kitchen cleanup',
      'Vegetarian cooking',
      'Non-vegetarian cooking (if selected)',
    ],
    notIncluded: [
      'Grocery shopping',
      'Deep kitchen cleaning',
      'Party/event cooking',
      'Catering services',
    ],
  },
};

export type WhatsIncludedSource = 'home' | 'booking';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType: IncludedServiceType;
  source: WhatsIncludedSource;
}

export function WhatsIncludedSheet({ open, onOpenChange, serviceType, source }: Props) {
  const details = SERVICE_DETAILS[serviceType];

  React.useEffect(() => {
    if (open && details) {
      // Lightweight analytics — non-blocking
      try {
        console.log('📊 [analytics] whats_included_opened', {
          event: 'whats_included_opened',
          service_type: serviceType,
          opened_from_home: source === 'home',
          opened_from_booking: source === 'booking',
          timestamp: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }
  }, [open, serviceType, source, details]);

  if (!details) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 max-h-[85vh] flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted mb-3" />
          <SheetTitle className="text-left text-xl font-bold">
            What's Included?
          </SheetTitle>
          <p className="text-left text-sm text-muted-foreground">{details.title}</p>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-6">
            {/* Included */}
            <section>
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Included
              </h3>
              <ul className="space-y-2.5">
                {details.included.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Not Included */}
            <section>
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mb-3">
                <XCircle className="w-5 h-5 text-orange-600" />
                Not Included
              </h3>
              <ul className="space-y-2.5">
                {details.notIncluded.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5"
                  >
                    <XCircle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="text-xs text-muted-foreground flex items-start gap-2 pt-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              For anything outside this list, please contact support before the visit.
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
