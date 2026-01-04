import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim';

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
export function generateTransactionRef(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIDI${timestamp}${random}`;
}

/**
 * Build generic UPI URL with all parameters (used by all apps on iOS except GPay)
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

/**
 * Build Google Pay specific URL (only GPay has documented scheme)
 */
function buildGPayUrl(params: UpiParams): string {
  const pa = enc(params.pa);
  const pn = enc(params.pn || 'Didi Now Worker');
  const tn = enc(params.tn || 'Didi Now service payment');
  const tr = enc(params.tr || generateTransactionRef());
  
  let url = `gpay://upi/pay?pa=${pa}&pn=${pn}&cu=INR&tn=${tn}&tr=${tr}`;
  
  if (params.am && params.am > 0) {
    url += `&am=${params.am.toFixed(2)}`;
  }
  
  return url;
}

export const UPI_APPS: UpiApp[] = [
  {
    key: 'gpay',
    label: 'Google Pay',
    // GPay has documented scheme that works on iOS
    buildUrl: (p) => buildGPayUrl(p),
    appStore: 'itms-apps://itunes.apple.com/app/id1193357041'
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    // Use generic upi:// for PhonePe on iOS (phonepe:// is unreliable)
    buildUrl: (p) => buildGenericUpiUrl(p),
    appStore: 'itms-apps://itunes.apple.com/app/id1170055821'
  },
  {
    key: 'paytm',
    label: 'Paytm',
    // Use generic upi:// for Paytm on iOS
    buildUrl: (p) => buildGenericUpiUrl(p),
    appStore: 'itms-apps://itunes.apple.com/app/id473941634'
  },
  {
    key: 'bhim',
    label: 'BHIM / Other UPI',
    buildUrl: (p) => buildGenericUpiUrl(p),
    appStore: 'itms-apps://itunes.apple.com/app/id1172680810'
  }
];

/** 
 * Detect installed UPI apps
 * On iOS, only GPay can be reliably detected via scheme
 * Others use generic upi:// which opens system picker
 */
export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  const platform = Capacitor.getPlatform();
  
  // On iOS, we can't reliably detect most UPI apps
  // Just return all apps and let user choose
  if (platform === 'ios') {
    return UPI_APPS;
  }
  
  // On Android, try to detect
  const probeParams: UpiParams = { pa: 'probe@upi', pn: 'Test', tn: 'Probe', tr: 'PROBE123' };
  const found: UpiApp[] = [];

  for (const app of UPI_APPS) {
    const url = app.buildUrl(probeParams);
    try {
      const can = await AppLauncher.canOpenUrl({ url });
      if (can.value) found.push(app);
    } catch {}
  }
  
  return found;
}

/** Try to open URL; return true if successful */
export async function tryOpen(url: string): Promise<boolean> {
  try {
    await AppLauncher.openUrl({ url });
    return true;
  } catch {
    return false;
  }
}
