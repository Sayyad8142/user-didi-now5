export interface UpiParams {
  pa: string;      // payee address (UPI ID)
  pn?: string;     // payee name
  am?: number;     // amount
  tn?: string;     // transaction note
}

export function buildUpiUrl({ pa, pn, am, tn }: UpiParams): string {
  const params = new URLSearchParams();
  params.set('pa', pa);
  if (pn) params.set('pn', pn);
  if (am) params.set('am', String(am));
  params.set('cu', 'INR');
  if (tn) params.set('tn', tn);
  return `upi://pay?${params.toString()}`;
}

import { openExternalUrl } from '@/lib/nativeOpen';

export function openUpi(url: string): void {
  openExternalUrl(url);
}