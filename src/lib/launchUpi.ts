import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { ActionSheet } from '@capacitor/action-sheet';
import { upiTargets, buildGenericUpiUrl, UpiParams } from './upi';

async function getInstalledUpiTargets() {
  const checks = await Promise.all(
    upiTargets.map(async t => {
      try {
        const res = await AppLauncher.canOpenUrl({ url: t.scheme });
        return res.value ? t : null;
      } catch {
        return null;
      }
    })
  );
  // Always keep generic as a fallback at the end
  const list = checks.filter(Boolean) as typeof upiTargets;
  const hasGeneric = list.some(t => t.id === 'generic');
  return hasGeneric ? list : [...list, upiTargets.find(t=>t.id==='generic')!];
}

export async function launchUpiPayment(params: UpiParams) {
  const genericUrl = buildGenericUpiUrl(params);
  
  // Use the simple and reliable approach that works on both platforms
  // This will show the native app chooser on both iOS and Android
  try {
    window.location.href = genericUrl;
  } catch (e) {
    // Fallback: try using AppLauncher if window.location.href fails
    try {
      await AppLauncher.openUrl({ url: genericUrl });
    } catch (launcherError) {
      alert('No compatible UPI app found. Please install a UPI app like GPay, PhonePe, or Paytm.');
    }
  }
}
