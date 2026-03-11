import { Download, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';

interface SoftUpdateModalProps {
  title: string;
  message: string;
  storeUrl: string;
  currentVersion: string;
  latestVersion: string;
  onDismiss: () => void;
}

export function SoftUpdateModal({
  title,
  message,
  storeUrl,
  currentVersion,
  latestVersion,
  onDismiss,
}: SoftUpdateModalProps) {
  const handleUpdate = async () => {
    if (!storeUrl) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: storeUrl });
      } catch {
        window.open(storeUrl, '_blank');
      }
    } else {
      window.open(storeUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-end justify-center">
      <div className="bg-background w-full max-w-md rounded-t-3xl p-6 pb-safe animate-in slide-in-from-bottom duration-300">
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onDismiss}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-primary/10 p-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-lg font-bold text-foreground text-center mb-2">
          {title || 'Update Available'}
        </h2>

        <p className="text-sm text-muted-foreground text-center mb-2 max-w-xs mx-auto leading-relaxed">
          {message}
        </p>

        <p className="text-xs text-muted-foreground/60 text-center mb-6">
          {currentVersion} → {latestVersion}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleUpdate}
            size="lg"
            className="w-full h-12 gap-2"
          >
            <Download className="h-4 w-4" />
            Update Now
          </Button>

          <Button
            onClick={onDismiss}
            size="lg"
            variant="ghost"
            className="w-full h-12 text-muted-foreground"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
