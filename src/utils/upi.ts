import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';

export interface UpiParams {
  pa: string; // Payee address (UPI ID)
  pn?: string; // Payee name
  tn?: string; // Transaction note
}

export interface UpiApp {
  key: UpiAppKey;
  label: string;
  buildUrl: (params: UpiParams) => string;
  appStore?: string;
}

const enc = (v: string) => encodeURIComponent(v?.trim() ?? '');

/**
 * Build UPI URL with mandatory params (no amount - user enters manually)
 */
function buildAppUrl(scheme: string, params: UpiParams): string {
  const pa = enc(params.pa);
  const pn = enc(params.pn || 'Worker');
  const tn = enc(params.tn || 'Service payment');
  return `${scheme}://upi/pay?pa=${pa}&pn=${pn}&tn=${tn}&cu=INR`;
}

export const UPI_APPS: UpiApp[] = [
  {
    key: 'gpay',
    label: 'Google Pay',
    buildUrl: (p) => buildAppUrl('gpay', p),
    appStore: 'itms-apps://itunes.apple.com/app/id1193357041'
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    buildUrl: (p) => buildAppUrl('phonepe', p),
    appStore: 'itms-apps://itunes.apple.com/app/id1170055821'
  },
  {
    key: 'paytm',
    label: 'Paytm',
    buildUrl: (p) => `paytmmp://pay?pa=${enc(p.pa)}&pn=${enc(p.pn || 'Worker')}&tn=${enc(p.tn || 'Service payment')}&cu=INR`,
    appStore: 'itms-apps://itunes.apple.com/app/id473941634'
  },
  {
    key: 'bhim',
    label: 'BHIM / UPI',
    buildUrl: (p) => `upi://pay?pa=${enc(p.pa)}&pn=${enc(p.pn || 'Worker')}&tn=${enc(p.tn || 'Service payment')}&cu=INR`,
    appStore: 'itms-apps://itunes.apple.com/app/id1172680810'
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    buildUrl: (p) => buildAppUrl('whatsapp', p),
    appStore: 'itms-apps://itunes.apple.com/app/id310633997'
  }
];

/** Path-aware detection; may still fail on some devices/builds. */
export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  const probeParams: UpiParams = { pa: 'probe@upi', pn: 'Test', tn: 'Probe' };
  const order: UpiAppKey[] = ['gpay', 'phonepe', 'paytm', 'bhim', 'whatsapp'];
  const byKey = Object.fromEntries(UPI_APPS.map(a => [a.key, a])) as Record<UpiAppKey, UpiApp>;
  const found: UpiApp[] = [];

  for (const key of order) {
    const url = byKey[key].buildUrl(probeParams);
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