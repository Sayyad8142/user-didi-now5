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
      'Bathroom floor cleaning',
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

type Props = {
  serviceKey: string;
  inclusions?: ServiceInclusions;
  className?: string;
};

export function ServiceInclusionsAccordion({ serviceKey, inclusions, className }: Props) {
  const [open, setOpen] = useState(false);
  const data = inclusions ?? SERVICE_INCLUSIONS[serviceKey];
  if (!data) return null;

  const panelId = `inclusions-${serviceKey}`;

  return (
    <div className={cn('mt-2', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span>{open ? 'Hide details' : "What's included & not included"}</span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <div
        id={panelId}
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="rounded-xl border border-border bg-background/60 p-3 space-y-3">
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                <Check className="h-3.5 w-3.5" /> What's Included
              </h4>
              <ul className="space-y-1 pl-1">
                {data.included.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-foreground/90">
                    <span className="mt-1 h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="h-px bg-border" />
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1.5">
                <X className="h-3.5 w-3.5" /> What's Not Included
              </h4>
              <ul className="space-y-1 pl-1">
                {data.notIncluded.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-1 h-1 w-1 rounded-full bg-destructive/70 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServiceInclusionsAccordion;
