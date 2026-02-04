import React from 'react';
import { UtensilsCrossed, Sparkles, ChefHat, HelpCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type DishIntensity = 'light' | 'medium' | 'heavy';

interface DishIntensityOption {
  value: DishIntensity;
  label: string;
  extra: number;
  icon: React.ReactNode;
  example: string;
}

const INTENSITY_OPTIONS: DishIntensityOption[] = [
  {
    value: 'light',
    label: 'Light',
    extra: 0,
    icon: <UtensilsCrossed className="w-6 h-6" />,
    example: 'Regular daily dishes',
  },
  {
    value: 'medium',
    label: 'Medium',
    extra: 30,
    icon: <Sparkles className="w-6 h-6" />,
    example: 'More vessels + cooking items',
  },
  {
    value: 'heavy',
    label: 'Heavy',
    extra: 50,
    icon: <ChefHat className="w-6 h-6" />,
    example: 'Guests / heavy cooking',
  },
];

export const getIntensityExtra = (intensity: DishIntensity): number => {
  const option = INTENSITY_OPTIONS.find(o => o.value === intensity);
  return option?.extra ?? 0;
};

interface DishIntensitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DishIntensity;
  onChange: (value: DishIntensity) => void;
}

export function DishIntensitySheet({
  open,
  onOpenChange,
  value,
  onChange,
}: DishIntensitySheetProps) {
  const [selected, setSelected] = React.useState<DishIntensity>(value);
  const [helpOpen, setHelpOpen] = React.useState(false);

  // Sync with external value when sheet opens
  React.useEffect(() => {
    if (open) {
      setSelected(value);
    }
  }, [open, value]);

  const handleConfirm = () => {
    onChange(selected);
    onOpenChange(false);
  };

  const handleKeepLight = () => {
    onChange('light');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-center pb-2">
          <DrawerTitle className="text-xl font-bold text-foreground">
            Dish Washing Workload
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            Choose what matches today's utensils
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Intensity Options */}
          <div className="space-y-2">
            {INTENSITY_OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setSelected(option.value)}
                  className={cn(
                    'w-full p-4 rounded-2xl border-2 transition-all duration-200 text-left',
                    isSelected
                      ? 'border-primary bg-gradient-to-r from-primary/10 to-primary/5 shadow-sm'
                      : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {option.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {option.label}
                        </span>
                        {option.extra > 0 ? (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs font-bold',
                              isSelected
                                ? 'bg-primary/20 text-primary'
                                : 'bg-orange-100 text-orange-600'
                            )}
                          >
                            +₹{option.extra}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs font-medium',
                              isSelected
                                ? 'bg-primary/20 text-primary'
                                : 'bg-green-100 text-green-600'
                            )}
                          >
                            ₹0
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {option.example}
                      </p>
                    </div>

                    {/* Selection Indicator */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/50'
                      )}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Why we ask - Collapsible */}
          <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span>Why we ask?</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform',
                    helpOpen && 'rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 bg-muted/50 rounded-xl mt-1">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This prevents on-site arguments. If needed, upgrades happen
                  only in the app.{' '}
                  <span className="font-medium text-foreground">
                    No cash payments.
                  </span>
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DrawerFooter className="pt-2">
          <Button
            onClick={handleConfirm}
            className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all"
          >
            Confirm
          </Button>
          <DrawerClose asChild>
            <Button
              variant="ghost"
              onClick={handleKeepLight}
              className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground"
            >
              Keep Light
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// Inline card component for showing selected intensity
interface DishIntensityCardProps {
  intensity: DishIntensity;
  onEdit: () => void;
}

export function DishIntensityCard({ intensity, onEdit }: DishIntensityCardProps) {
  const option = INTENSITY_OPTIONS.find((o) => o.value === intensity);
  if (!option) return null;

  return (
    <button
      onClick={onEdit}
      className="w-full mt-2 p-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 transition-all text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {option.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Workload: {option.label}
              </span>
              {option.extra > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-orange-100 text-orange-600"
                >
                  +₹{option.extra}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{option.example}</p>
          </div>
        </div>
        <span className="text-xs text-primary font-medium">Change</span>
      </div>
    </button>
  );
}
