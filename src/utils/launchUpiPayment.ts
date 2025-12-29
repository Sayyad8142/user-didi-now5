import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

type LaunchArgs = {
  pa: string; // UPI ID only
  onNeedChooser?: (v: boolean) => void;
};

export async function launchUpiPayment(args: LaunchArgs) {
  const platform = Capacitor.getPlatform();
  // Simple URL with just the UPI ID - user enters amount manually
  const simpleUrl = `upi://pay?pa=${encodeURIComponent(args.pa)}`;

  if (platform === 'android') {
    try { 
      window.location.href = simpleUrl; 
    } catch { 
      await AppLauncher.openUrl({ url: simpleUrl }); 
    }
    return;
  }

  if (platform === 'ios') {
    // Always let the user choose on iOS
    args.onNeedChooser?.(true);
    return;
  }

  await AppLauncher.openUrl({ url: simpleUrl });
}