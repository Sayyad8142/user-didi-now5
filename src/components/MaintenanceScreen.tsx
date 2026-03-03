import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface MaintenanceScreenProps {
  title: string;
  message: string;
  ctaLabel: string;
  onRetry: () => void;
}

export function MaintenanceScreen({ title, message, ctaLabel, onRetry }: MaintenanceScreenProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    onRetry();
    // Reset after a short delay so button re-enables if still blocked
    setTimeout(() => setRetrying(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-primary/10 p-5 mb-6">
        <Wrench className="h-10 w-10 text-primary" />
      </div>

      <h1 className="text-xl font-bold text-foreground mb-3">
        {title}
      </h1>

      <p className="text-sm text-muted-foreground mb-2 max-w-xs leading-relaxed">
        {message}
      </p>

      <p className="text-xs text-muted-foreground/60 mb-8">
        We'll be back soon
      </p>

      <Button
        onClick={handleRetry}
        size="lg"
        variant="outline"
        disabled={retrying}
        className="w-full max-w-xs h-12 gap-2 border-primary/30 text-primary hover:bg-primary/5"
      >
        {retrying ? 'Checking…' : ctaLabel}
      </Button>
    </div>
  );
}
