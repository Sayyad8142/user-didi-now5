import { useEffect } from 'react';
import { Download, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { getAppPlatform } from '@/utils/platform';

interface NativeUpdateRequiredScreenProps {
  message: string;
  storeUrl: string;
  currentVersion: string;
  requiredVersion: string;
  releaseNotes?: string;
  title?: string;
}

export function NativeUpdateRequiredScreen({
  message,
  storeUrl,
  currentVersion,
  requiredVersion,
  releaseNotes,
  title,
}: NativeUpdateRequiredScreenProps) {
  const platform = getAppPlatform();
  const storeName = platform === 'ios' ? 'App Store' : 'Play Store';

  // Block hardware back button on Android while force-update is showing
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: any;
    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        handle = await CapApp.addListener('backButton', () => {
          // Swallow back press — no escape from force update
        });
      } catch {}
    })();
    return () => { if (handle) handle.remove(); };
  }, []);

  const handleOpenStore = async () => {
    if (!storeUrl) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: storeUrl });
        return;
      } catch {
        // fall through to window.open
      }
    }
    try {
      window.open(storeUrl, '_blank');
    } catch {
      try { window.location.href = storeUrl; } catch {}
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, hsl(328 100% 97%) 0%, hsl(328 100% 92%) 50%, hsl(320 100% 88%) 100%)',
      }}
    >
      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-fuchsia-500 blur-xl opacity-40" />
            <div className="relative h-20 w-20 rounded-3xl bg-white shadow-xl ring-1 ring-black/5 flex items-center justify-center overflow-hidden">
              <img
                src="/app-icon.png"
                alt="Didi Now"
                className="h-14 w-14 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
        </div>

        {/* Brand wordmark */}
        <div className="mb-7">
          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent tracking-tight">
            Didi Now
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">in 10 Mins</p>
        </div>

        {/* Update card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 p-6">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-lg shadow-primary/30">
              <ArrowUpCircle className="h-7 w-7 text-white" />
            </div>
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2 leading-tight">
            {title || 'Update Required'}
          </h1>

          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            {message || 'A new version of Didi Now is available. Please update to continue using the app.'}
          </p>

          {releaseNotes ? (
            <div className="bg-pink-50/70 rounded-xl p-3 mb-4 text-left">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-pink-600 mb-1">
                What's new
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                {releaseNotes}
              </p>
            </div>
          ) : null}

          {/* Version row */}
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/80 mb-5">
            <span className="px-2 py-1 rounded-full bg-muted/60 font-medium">
              You: {currentVersion || '—'}
            </span>
            <span className="text-muted-foreground/50">→</span>
            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
              {requiredVersion || '—'}+
            </span>
          </div>

          {storeUrl ? (
            <Button
              onClick={handleOpenStore}
              size="lg"
              className="w-full h-12 gap-2 rounded-2xl text-base font-semibold bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-95 shadow-lg shadow-primary/30 border-0"
            >
              <Download className="h-4 w-4" />
              Update Now
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground/70">
              Store link not available. Please update manually from your {storeName}.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground/60 mt-4">
            This update is required to continue.
          </p>
        </div>
      </div>
    </div>
  );
}
