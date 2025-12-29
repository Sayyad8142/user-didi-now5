import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';
export interface UpiApp {
  key: UpiAppKey;
  label: string;
  // Simplified: just pass UPI ID, user enters amount manually
  buildUrl: (pa: string) => string;
  appStore?: string; // iOS App Store deep link
}

const enc = (v: string) => encodeURIComponent(v ?? '');

export const UPI_APPS: UpiApp[] = [
  {
    key: 'gpay',
    label: 'Google Pay',
    buildUrl: (pa) => `gpay://upi/pay?pa=${enc(pa)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1193357041'
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    buildUrl: (pa) => `phonepe://upi/pay?pa=${enc(pa)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1170055821'
  },
  {
    key: 'paytm',
    label: 'Paytm',
    buildUrl: (pa) => `paytmmp://pay?pa=${enc(pa)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id473941634'
  },
  {
    key: 'bhim',
    label: 'BHIM / UPI',
    buildUrl: (pa) => `upi://pay?pa=${enc(pa)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1172680810'
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    buildUrl: (pa) => `whatsapp://upi/pay?pa=${enc(pa)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id310633997'
  }
];

/** Path-aware detection; may still fail on some devices/builds. */
export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  const PROBE_UPI = 'probe@upi';
  const order: UpiAppKey[] = ['gpay', 'phonepe', 'paytm', 'bhim', 'whatsapp'];
  const byKey = Object.fromEntries(UPI_APPS.map(a => [a.key, a])) as Record<UpiAppKey, UpiApp>;
  const found: UpiApp[] = [];

  for (const key of order) {
    const url = byKey[key].buildUrl(PROBE_UPI);
    try {
      const can = await AppLauncher.canOpenUrl({ url });
      if (can.value) found.push(byKey[key]);
    } catch {}
  }
  return found;
}

/** Try to open; return true if the app opened. */
export async function tryOpen(url: string): Promise<boolean> {
  try {
    await AppLauncher.openUrl({ url });
    return true;
  } catch {
    return false;
  }
}