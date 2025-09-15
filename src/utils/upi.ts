import { AppLauncher } from '@capacitor/app-launcher';

export type UpiAppKey = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'whatsapp';
export interface UpiApp {
  key: UpiAppKey;
  label: string;
  // Build a real payment URL (used both for open and for canOpenURL probe)
  buildUrl: (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) => string;
}

const enc = (v: string | number) => encodeURIComponent(String(v ?? ''));
const qs = (p: { pa: string; pn: string; am: string; tn: string; tr?: string }) =>
  `pa=${enc(p.pa)}&pn=${enc(p.pn)}&am=${enc(p.am)}&tn=${enc(p.tn)}&cu=INR${p.tr ? `&tr=${enc(p.tr)}` : ''}`;

// Use **real paths** that those apps register, not just scheme roots:
export const UPI_APPS: UpiApp[] = [
  // Google Pay (India). iOS supports gpay://; tez:// is legacy alias.
  { key: 'gpay', label: 'Google Pay', buildUrl: p => `gpay://upi/pay?${qs(p)}` },
  // PhonePe
  { key: 'phonepe', label: 'PhonePe', buildUrl: p => `phonepe://upi/pay?${qs(p)}` },
  // Paytm (payments path is /pay for iOS)
  { key: 'paytm', label: 'Paytm', buildUrl: p => `paytmmp://pay?${qs(p)}` },
  // BHIM / generic UPI handler
  { key: 'bhim', label: 'BHIM/UPI', buildUrl: p => `upi://pay?${qs(p)}` },
  // WhatsApp (kept as last resort)
  { key: 'whatsapp', label: 'WhatsApp', buildUrl: p => `whatsapp://upi/pay?${qs(p)}` },
];

export async function detectInstalledUpiApps(): Promise<UpiApp[]> {
  // Use a **valid-looking** probe URL per app; some apps return false for bare schemes.
  const PROBE = { pa: 'probe@upi', pn: 'Probe', am: '1', tn: 'probe', tr: 'probe' };
  const found: UpiApp[] = [];

  // Stable order: prefer mainstream, push WhatsApp to the end.
  const order: UpiAppKey[] = ['gpay', 'phonepe', 'paytm', 'bhim', 'whatsapp'];
  const byKey: Record<UpiAppKey, UpiApp> = Object.fromEntries(UPI_APPS.map(a => [a.key, a])) as any;

  for (const key of order) {
    const app = byKey[key];
    const testUrl = app.buildUrl(PROBE);
    try {
      const can = await AppLauncher.canOpenUrl({ url: testUrl });
      if (can.value) found.push(app);
    } catch (e) {
      // optional: console.warn('canOpenUrl error', key, e);
    }
  }
  return found;
}

export async function openUpiUrl(url: string) {
  await AppLauncher.openUrl({ url });
}