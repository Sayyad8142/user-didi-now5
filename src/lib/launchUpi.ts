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
    // Android already shows app chooser for upi://
    await AppLauncher.openUrl({ url: genericUrl });
    return;
  }

  // iOS: show our own picker
  const available = await getInstalledUpiTargets();
  // Filter out 'generic' if we have specific apps
  const specific = available.filter(a => a.id !== 'generic');
  const options = (specific.length ? specific : available).map(a => ({ title: a.label, id: a.id }));

  const { index } = await ActionSheet.showActions({
    title: 'Choose UPI app',
    options,
  });

  const chosen = (specific.length ? specific : available)[index];
  const url = chosen ? chosen.build(params) : genericUrl;

  const { value } = await AppLauncher.canOpenUrl({ url });
  if (!value) {
    // Fallback to generic
    await AppLauncher.openUrl({ url: genericUrl });
    return;
  }
  await AppLauncher.openUrl({ url });
}
