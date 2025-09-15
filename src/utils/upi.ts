import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';
export interface UpiApp {
  key: UpiAppKey;
  label: string;
  buildUrl: (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) => string;
  appStore?: string; // iOS App Store deep link
}

const enc = (v: string | number) => encodeURIComponent(String(v ?? ''));
const qs = (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) =>
  `pa=${enc(p.pa)}&pn=${enc(p.pn)}&am=${enc(p.am)}&tn=${enc(p.tn)}&cu=INR${p.tr ? `&tr=${enc(p.tr)}` : ''}`;

export const UPI_APPS: UpiApp[] = [
  {
    key: 'gpay',
    label: 'Google Pay',
    buildUrl: p => `gpay://upi/pay?${qs(p)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1193357041'
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    buildUrl: p => `phonepe://upi/pay?${qs(p)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1170055821'
  },
  {
    key: 'paytm',
    label: 'Paytm',
    buildUrl: p => `paytmmp://pay?${qs(p)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id473941634'
  },
  {
    key: 'bhim',
    label: 'BHIM / UPI',
    buildUrl: p => `upi://pay?${qs(p)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id1172680810'
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    buildUrl: p => `whatsapp://upi/pay?${qs(p)}`,
    appStore: 'itms-apps://itunes.apple.com/app/id310633997'
  }
];

/** Path-aware detection; may still fail on some devices/builds. */
export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  const PROBE = { pa: 'probe@upi', pn: 'Probe', am: '1', tn: 'probe', tr: 'probe' };
  const order: UpiAppKey[] = ['gpay', 'phonepe', 'paytm', 'bhim', 'whatsapp'];
  const byKey = Object.fromEntries(UPI_APPS.map(a => [a.key, a])) as Record<UpiAppKey, UpiApp>;
  const found: UpiApp[] = [];

  for (const key of order) {
    const url = byKey[key].buildUrl(PROBE);
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
    const res = await AppLauncher.openUrl({ url });
    // Capacitor AppLauncher doesn't always return a boolean; assume success if no throw.
    return true;
  } catch {
    return false;
  }
}