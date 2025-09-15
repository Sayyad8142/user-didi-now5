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
  const platform = Capacitor.getPlatform();
  const genericUrl = buildGenericUpiUrl(params);

  if (platform === 'android') {
    // Android shows native app chooser with window.location.href
    try {
      window.location.href = genericUrl;
    } catch (e) {
      await AppLauncher.openUrl({ url: genericUrl });
    }
    return;
  }

  // iOS: show custom picker to choose between available UPI apps
  const available = await getInstalledUpiTargets();
  
  if (available.length === 1) {
    // Only one app available, open it directly
    const url = available[0].build(params);
    await AppLauncher.openUrl({ url });
    return;
  }

  // Multiple apps available, show chooser
  const options = available.map(a => ({ title: a.label, id: a.id }));

  const { index } = await ActionSheet.showActions({
    title: 'Choose UPI app',
    options,
  });

  const chosen = available[index];
  if (chosen) {
    const url = chosen.build(params);
    await AppLauncher.openUrl({ url });
  }
}
