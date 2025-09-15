import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

type LaunchArgs = {
  pa: string; pn: string; am: string; tn: string; tr?: string;
  onNeedChooser?: (v: boolean) => void;
};

export async function launchUpiPayment(args: LaunchArgs) {
  const platform = Capacitor.getPlatform();
  const generic = `upi://pay?pa=${encodeURIComponent(args.pa)}&pn=${encodeURIComponent(args.pn)}&am=${encodeURIComponent(args.am)}&tn=${encodeURIComponent(args.tn)}&cu=INR${args.tr ? `&tr=${encodeURIComponent(args.tr)}` : ''}`;

  if (platform === 'android') {
    try { window.location.href = generic; } catch { await AppLauncher.openUrl({ url: generic }); }
    return;
  }

  if (platform === 'ios') {
    // Always let the user choose on iOS (force chooser mode will handle detection failures).
    args.onNeedChooser?.(true);
    return;
  }

  await AppLauncher.openUrl({ url: generic });
}