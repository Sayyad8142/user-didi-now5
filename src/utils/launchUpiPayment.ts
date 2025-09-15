import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { detectInstalledUpiApps } from '@/utils/upi';

type LaunchArgs = {
  pa: string; 
  pn: string; 
  am: string; 
  tn: string; 
  tr?: string;
  onNeedChooser?: (open: boolean) => void; // wire this to UpiChooser
};

export async function launchUpiPayment(args: LaunchArgs) {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const isIOS = Capacitor.getPlatform() === 'ios';

  // ANDROID: keep existing behavior (system chooser via generic UPI)
  if (isAndroid) {
    const generic = `upi://pay?pa=${encodeURIComponent(args.pa)}&pn=${encodeURIComponent(args.pn)}&am=${encodeURIComponent(args.am)}&tn=${encodeURIComponent(args.tn)}&cu=INR${args.tr ? `&tr=${encodeURIComponent(args.tr)}` : ''}`;
    try {
      // Most Android ROMs show an app chooser for generic UPI
      window.location.href = generic;
    } catch {
      await AppLauncher.openUrl({ url: generic });
    }
    return;
  }

  // iOS: NEVER auto-open WhatsApp. Detect and present a chooser.
  if (isIOS) {
    const installed = await detectInstalledUpiApps();
    if (installed.length === 1) {
      // Open the only available app
      const app = installed[0];
      const url = app.buildUrl(args);
      await AppLauncher.openUrl({ url });
      return;
    }
    // Multiple (or zero) apps: ask the user
    if (args.onNeedChooser) args.onNeedChooser(true);
    return;
  }

  // Fallback (web/PWA)
  const webUrl = `upi://pay?pa=${encodeURIComponent(args.pa)}&pn=${encodeURIComponent(args.pn)}&am=${encodeURIComponent(args.am)}&tn=${encodeURIComponent(args.tn)}&cu=INR${args.tr ? `&tr=${encodeURIComponent(args.tr)}` : ''}`;
  await AppLauncher.openUrl({ url: webUrl });
}
