import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';

export interface UpiApp {
  key: UpiAppKey;
  label: string;
  schemeTest: string; // scheme:// used for canOpen
  buildUrl: (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) => string;
}

/** Safely encode */
const enc = (v: string | number) => encodeURIComponent(String(v || ''));

/** Generic UPI query string */
const upiQS = (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) =>
  `pa=${enc(p.pa)}&pn=${enc(p.pn)}&am=${enc(p.am)}&tn=${enc(p.tn)}&cu=INR${p.tr ? `&tr=${enc(p.tr)}` : ''}`;

export const UPI_APPS: UpiApp[] = [
  {
    key: 'gpay',
    label: 'Google Pay',
    schemeTest: 'gpay://',
    buildUrl: (p) => `gpay://upi/pay?${upiQS(p)}`
    // alt legacy: tez://upi/pay
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    schemeTest: 'phonepe://',
    buildUrl: (p) => `phonepe://upi/pay?${upiQS(p)}`
  },
  {
    key: 'paytm',
    label: 'Paytm',
    schemeTest: 'paytmmp://',
    // Paytm expects /pay and supports standard UPI params
    buildUrl: (p) => `paytmmp://pay?${upiQS(p)}`
  },
  {
    key: 'bhim',
    label: 'BHIM',
    schemeTest: 'upi://',
    buildUrl: (p) => `upi://pay?${upiQS(p)}`
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    schemeTest: 'whatsapp://',
    // WA supports upi deep link via whatsapp://upi/pay
    buildUrl: (p) => `whatsapp://upi/pay?${upiQS(p)}`
  }
];

export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  const results: UpiApp[] = [];
  for (const app of UPI_APPS) {
    try {
      const can = await AppLauncher.canOpenUrl({ url: app.schemeTest });
      if (can.value) results.push(app);
    } catch { /* ignore */ }
  }
  // Prefer mainstream options first (GPay, PhonePe, Paytm, BHIM), then WhatsApp last
  const order: UpiAppKey[] = ['gpay', 'phonepe', 'paytm', 'bhim', 'whatsapp'];
  results.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return results;
}

export async function openUpiUrl(url: string) {
  await AppLauncher.openUrl({ url });
}