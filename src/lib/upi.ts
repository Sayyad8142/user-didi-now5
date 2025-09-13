export type UpiParams = {
  pa: string;   // VPA (UPI ID)
  pn?: string;  // Payee name
  am?: string;  // Amount
  tn?: string;  // Note
  cu?: string;  // Currency, default INR
  tr?: string;  // Txn ref
};

const qp = (p: Record<string, string | undefined>) =>
  Object.entries(p)
    .filter(([,v]) => v != null && v !== '')
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');

export const buildGenericUpiUrl = (p: UpiParams) =>
  `upi://pay?${qp({ pa: p.pa, pn: p.pn, am: p.am, tn: p.tn, cu: p.cu ?? 'INR', tr: p.tr })}`;

export const buildGpayUrl = (p: UpiParams) =>
  `gpay://upi/pay?${qp({ pa: p.pa, pn: p.pn, am: p.am, tn: p.tn, cu: p.cu ?? 'INR', tr: p.tr })}`;
// legacy alias
export const buildTezUrl = buildGpayUrl;

export const buildPhonePeUrl = (p: UpiParams) =>
  `phonepe://upi/pay?${qp({ pa: p.pa, pn: p.pn, am: p.am, tn: p.tn, cu: p.cu ?? 'INR', tr: p.tr })}`;

export const buildPaytmUrl = (p: UpiParams) =>
  `paytmmp://pay?${qp({ pa: p.pa, pn: p.pn, am: p.am, tn: p.tn, cu: p.cu ?? 'INR', tr: p.tr })}`;

export const buildBhimUrl = (p: UpiParams) =>
  `bhim://upi/pay?${qp({ pa: p.pa, pn: p.pn, am: p.am, tn: p.tn, cu: p.cu ?? 'INR', tr: p.tr })}`;

export type UpiTarget = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'generic';

export const upiTargets: { id: UpiTarget; label: string; scheme: string; build: (p: UpiParams)=>string }[] = [
  { id: 'gpay',    label: 'Google Pay', scheme: 'gpay://',    build: buildGpayUrl },
  { id: 'phonepe', label: 'PhonePe',    scheme: 'phonepe://', build: buildPhonePeUrl },
  { id: 'paytm',   label: 'Paytm',      scheme: 'paytmmp://', build: buildPaytmUrl },
  { id: 'bhim',    label: 'BHIM',       scheme: 'bhim://',    build: buildBhimUrl },
  { id: 'generic', label: 'Other UPI App', scheme: 'upi://',  build: buildGenericUpiUrl },
];