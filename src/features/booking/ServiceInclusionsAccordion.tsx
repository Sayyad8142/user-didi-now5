import { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ServiceInclusions = {
  included: string[];
  notIncluded: string[];
};

export const SERVICE_INCLUSIONS: Record<string, ServiceInclusions> = {
  floor_cleaning: {
    included: [
      'Sweeping (Jhadu)',
      'Mopping (Pocha)',
      'Hall/Living Room floor cleaning',
      'Bedroom floor cleaning',
      'Balcony floor cleaning (if accessible)',
    ],
    notIncluded: [
      'Deep cleaning',
      'Kitchen cleaning',
      'Kitchen platform cleaning',
      'Dusting of furniture',
      'Dusting of fans and lights',
      'Window cleaning',
      'Sofa cleaning',
      'Carpet cleaning',
      'Wall cleaning',
      'Bathroom deep scrubbing',
      'Removal of hard stains',
    ],
  },
  dish_washing: {
    included: [
      'Washing utensils and vessels',
      'Cleaning plates, bowls, glasses, pans, etc.',
      'Rinsing utensils',
      'Placing utensils back in racks/shelves',
      'Kitchen floor tile cleaning around the washing area',
    ],
    notIncluded: [
      'Kitchen deep cleaning',
      'Kitchen platform cleaning',
      'Stove/Hob cleaning',
      'Chimney cleaning',
      'Cabinet cleaning',
      'Drawer cleaning',
      'Refrigerator cleaning',
      'Microwave/Oven cleaning',
      'Oil and grease stain removal',
      'Full kitchen scrubbing',
    ],
  },
};

type InclusionsToggleProps = {
  open: boolean;
  onToggle: () => void;
  className?: string;
  ariaControls?: string;
};

export function ServiceInclusionsToggle({ open, onToggle, className, ariaControls }: InclusionsToggleProps) {
  return (
    <button
      type="button"
      aria-label={open ? 'Hide service details' : 'Show service details'}
      aria-expanded={open}
      aria-controls={ariaControls}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
        className
      )}
    >
      <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
    </button>
  );
}

type PanelProps = {
  serviceKey: string;
  open: boolean;
  inclusions?: ServiceInclusions;
  id?: string;
};

export function ServiceInclusionsPanel({ serviceKey, open, inclusions, id }: PanelProps) {
  const data = inclusions ?? SERVICE_INCLUSIONS[serviceKey];
  if (!data) return null;

  return (
    <div
      id={id}
      className={cn(
        'grid transition-all duration-300 ease-out',
        open ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
      )}
    >
      <div className="overflow-hidden">
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Service Details
          </h4>
          <section>
            <h5 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
              <Check className="h-3.5 w-3.5" /> What's Included
            </h5>
            <ul className="space-y-0.5 pl-1">
              {data.included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs leading-snug text-foreground/90">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="h-px bg-border my-2" />
          <section>
            <h5 className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1">
              <X className="h-3.5 w-3.5" /> What's Not Included
            </h5>
            <ul className="space-y-0.5 pl-1">
              {data.notIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-destructive/70 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// Backwards-compatible all-in-one (kept for any future use)
export function ServiceInclusionsAccordion({ serviceKey, inclusions, className }: { serviceKey: string; inclusions?: ServiceInclusions; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `inclusions-${serviceKey}`;
  return (
    <div className={cn('mt-2', className)}>
      <div className="flex justify-end">
        <ServiceInclusionsToggle open={open} onToggle={() => setOpen((v) => !v)} ariaControls={panelId} />
      </div>
      <ServiceInclusionsPanel serviceKey={serviceKey} inclusions={inclusions} open={open} id={panelId} />
    </div>
  );
}

export default ServiceInclusionsAccordion;

