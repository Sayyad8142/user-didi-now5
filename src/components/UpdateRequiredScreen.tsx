import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpdateRequiredScreenProps {
  onRefresh: () => void;
}

export function UpdateRequiredScreen({ onRefresh }: UpdateRequiredScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>

      <h1 className="text-xl font-bold text-foreground mb-2">
        Update Required
      </h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs">
        A new version of Didi Now is available. Please refresh to continue using the app.
      </p>

      <Button onClick={onRefresh} size="lg" className="w-full max-w-xs h-12 gap-2">
        <RefreshCw className="h-4 w-4" />
        Refresh Now
      </Button>
    </div>
  );
}
