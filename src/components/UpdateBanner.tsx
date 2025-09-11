import { Button } from '@/components/ui/button';
import { X, RefreshCw } from 'lucide-react';

interface UpdateBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ onRefresh, onDismiss }: UpdateBannerProps) {
  return (
    <div className="bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between min-h-[48px] safe-area-top">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <RefreshCw className="h-3 w-3 flex-shrink-0" />
        <span className="text-xs font-medium truncate">New update available</span>
      </div>
      
      <div className="flex items-center space-x-1 flex-shrink-0">
        <Button
          onClick={onRefresh}
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-xs"
        >
          Refresh
        </Button>
        <Button
          onClick={onDismiss}
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/20"
        >
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
}