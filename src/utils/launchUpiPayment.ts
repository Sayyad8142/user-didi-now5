import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { detectInstalledUpiApps } from '@/utils/upi';

type LaunchArgs = { pa: string; pn: string; am: string; tn: string; tr?: string; onNeedChooser?: (v: boolean) => void; };

export async function launchUpiPayment(args: LaunchArgs) {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const isIOS = Capacitor.getPlatform() === 'ios';

  const generic = `upi://pay?pa=${encodeURIComponent(args.pa)}&pn=${encodeURIComponent(args.pn)}&am=${encodeURIComponent(args.am)}&tn=${encodeURIComponent(args.tn)}&cu=INR${args.tr ? `&tr=${encodeURIComponent(args.tr)}` : ''}`;

  if (isAndroid) {
    try { window.location.href = generic; } catch { await AppLauncher.openUrl({ url: generic }); }
    return;
  }

  if (isIOS) {
    // 1) Try chooser with detected apps
    const installed = await detectInstalledUpiApps();
    if (installed.length === 1) {
      await AppLauncher.openUrl({ url: installed[0].buildUrl(args) });
      return;
    }
    if (installed.length > 1) {
      args.onNeedChooser?.(true);
      return;
    }

    // 2) If detection still empty, do a **direct generic probe**; many devices will route it to a default UPI app.
    const genericProbe = await AppLauncher.canOpenUrl({ url: `upi://pay` });
    if (genericProbe.value) {
      await AppLauncher.openUrl({ url: generic });
      return;
    }

    // 3) As a last resort, show your "no apps" message/QR flow.
    args.onNeedChooser?.(true); // triggers your "No supported UPI apps found" UI
    return;
  }

  // Web fallback
  await AppLauncher.openUrl({ url: generic });
}