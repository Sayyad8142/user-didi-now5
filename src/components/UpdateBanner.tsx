import { Button } from '@/components/ui/button';
import { X, RefreshCw } from 'lucide-react';

interface UpdateBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ onRefresh, onDismiss }: UpdateBannerProps) {
  return (
    <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <RefreshCw className="h-4 w-4" />
        <span className="text-sm font-medium">New update available — Refresh</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={onRefresh}
          size="sm"
          variant="secondary"
          className="h-7 px-3 text-xs"
        >
          Refresh
        </Button>
        <Button
          onClick={onDismiss}
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-primary-foreground hover:bg-primary-foreground/20"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}