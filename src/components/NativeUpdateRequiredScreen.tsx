import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { getAppPlatform } from '@/utils/platform';

interface NativeUpdateRequiredScreenProps {
  message: string;
  storeUrl: string;
  currentVersion: string;
  requiredVersion: string;
  releaseNotes?: string;
}

export function NativeUpdateRequiredScreen({
  message,
  storeUrl,
  currentVersion,
  requiredVersion,
  releaseNotes,
}: NativeUpdateRequiredScreenProps) {
  const platform = getAppPlatform();
  const storeName = platform === 'ios' ? 'App Store' : 'Play Store';

  const handleOpenStore = async () => {
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
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>

      <h1 className="text-xl font-bold text-foreground mb-2">
        App Update Required
      </h1>

      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        {message}
      </p>

      {releaseNotes ? (
        <p className="text-xs text-muted-foreground/80 mb-4 max-w-xs italic leading-relaxed">
          {releaseNotes}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground/70 mb-8">
        Your version: {currentVersion} · Required: {requiredVersion}+
      </p>

      {storeUrl ? (
        <Button onClick={handleOpenStore} size="lg" className="w-full max-w-xs h-12 gap-2">
          <Download className="h-4 w-4" />
          Update on {storeName}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground/60">
          Store link not available. Please update manually.
        </p>
      )}
    </div>
  );
}
