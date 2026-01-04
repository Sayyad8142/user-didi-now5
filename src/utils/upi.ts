import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';

export interface UpiParams {
  pa: string;       // Payee address (UPI ID)
  pn?: string;      // Payee name
  am?: number;      // Amount (optional, 2 decimal places)
  tn?: string;      // Transaction note
  tr?: string;      // Transaction reference
}

export interface UpiApp {
  key: UpiAppKey;
  label: string;
  buildUrl: (params: UpiParams) => string;
  appStore?: string;
}

const enc = (v: string) => encodeURIComponent(v?.trim() ?? '');

/**
 * Generates a unique transaction reference
 */
function generateTransactionRef(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIDI${timestamp}${random}`;
}

/**
 * Build complete UPI URL with all parameters
 */
function buildAppUrl(scheme: string, params: UpiParams): string {
  const pa = enc(params.pa);
  const pn = enc(params.pn || 'Didi Now Worker');
  const tn = enc(params.tn || 'Didi Now service payment');
  const tr = enc(params.tr || generateTransactionRef());
  
  let url = `${scheme}://upi/pay?pa=${pa}&pn=${pn}&cu=INR&tn=${tn}&tr=${tr}`;
  
  // Add amount only if provided and valid
  if (params.am && params.am > 0) {
    url += `&am=${params.am.toFixed(2)}`;
  }
  
  return url;
}

/**
 * Build generic UPI URL (for BHIM and fallback)
 */
function buildGenericUpiUrl(params: UpiParams): string {
  const pa = enc(params.pa);
  const pn = enc(params.pn || 'Didi Now Worker');
  const tn = enc(params.tn || 'Didi Now service payment');
  const tr = enc(params.tr || generateTransactionRef());
  
  let url = `upi://pay?pa=${pa}&pn=${pn}&cu=INR&tn=${tn}&tr=${tr}`;
  
  if (params.am && params.am > 0) {
    url += `&am=${params.am.toFixed(2)}`;
  }
  
  return url;
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
    buildUrl: (p) => {
      const pa = enc(p.pa);
      const pn = enc(p.pn || 'Didi Now Worker');
      const tn = enc(p.tn || 'Didi Now service payment');
      const tr = enc(p.tr || generateTransactionRef());
      
      let url = `paytmmp://pay?pa=${pa}&pn=${pn}&cu=INR&tn=${tn}&tr=${tr}`;
      if (p.am && p.am > 0) {
        url += `&am=${p.am.toFixed(2)}`;
      }
      return url;
    },
    appStore: 'itms-apps://itunes.apple.com/app/id473941634'
  },
  {
    key: 'bhim',
    label: 'BHIM / UPI',
    buildUrl: (p) => buildGenericUpiUrl(p),
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
