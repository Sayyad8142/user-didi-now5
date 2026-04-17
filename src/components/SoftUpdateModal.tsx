import { Download, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { getAppPlatform } from '@/utils/platform';

interface SoftUpdateModalProps {
  title: string;
  message: string;
  storeUrl: string;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  onDismiss: () => void;
}

export function SoftUpdateModal({
  title,
  message,
  storeUrl,
  currentVersion,
  latestVersion,
  releaseNotes,
  onDismiss,
}: SoftUpdateModalProps) {
  const platform = getAppPlatform();
  const storeName = platform === 'ios' ? 'App Store' : 'Play Store';

  const handleUpdate = async () => {
    if (!storeUrl) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: storeUrl });
        return;
      } catch {}
    }
    try {
      window.open(storeUrl, '_blank');
    } catch {
      try { window.location.href = storeUrl; } catch {}
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onDismiss}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl pb-safe overflow-hidden animate-in slide-in-from-bottom duration-300 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header */}
        <div className="relative bg-gradient-to-br from-pink-500 via-rose-500 to-fuchsia-500 px-6 pt-6 pb-12">
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>

          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md ring-1 ring-white/30 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>

        {/* Logo chip overlapping the gradient */}
        <div className="flex justify-center -mt-7 mb-3">
          <div className="h-14 w-14 rounded-2xl bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center overflow-hidden">
            <img
              src="/app-icon.png"
              alt="Didi Now"
              className="h-10 w-10 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        </div>

        <div className="px-6 pb-6">
          <h2 className="text-lg font-bold text-foreground text-center mb-2">
            {title || 'Update Available'}
          </h2>

          <p className="text-sm text-muted-foreground text-center mb-3 max-w-xs mx-auto leading-relaxed">
            {message}
          </p>

          {releaseNotes ? (
            <div className="bg-pink-50/70 rounded-xl p-3 mb-3 text-left">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-pink-600 mb-1">
                What's new
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                {releaseNotes}
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/80 mb-5">
            <span className="px-2 py-1 rounded-full bg-muted/60 font-medium">
              {currentVersion || '—'}
            </span>
            <span className="text-muted-foreground/50">→</span>
            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
              {latestVersion || '—'}
            </span>
          </div>

          <div className="space-y-2">
            {storeUrl ? (
              <Button
                onClick={handleUpdate}
                size="lg"
                className="w-full h-12 gap-2 rounded-2xl text-base font-semibold bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-95 shadow-lg shadow-primary/30 border-0"
              >
                <Download className="h-4 w-4" />
                Update Now
              </Button>
            ) : null}

            <Button
              onClick={onDismiss}
              size="lg"
              variant="ghost"
              className="w-full h-12 rounded-2xl text-muted-foreground hover:bg-muted/50"
            >
              Later
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
            You can continue using Didi Now.
          </p>
        </div>
      </div>
    </div>
  );
}
