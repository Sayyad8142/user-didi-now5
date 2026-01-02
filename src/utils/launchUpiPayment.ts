import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { toast } from 'sonner';

type LaunchArgs = {
  pa: string; // UPI ID
  pn?: string; // Payee name
  tn?: string; // Transaction note
  bookingId?: string; // For transaction note
  onNeedChooser?: (v: boolean) => void;
};

/**
 * Validates UPI ID format
 * Must contain @ and no spaces after trim
 */
function isValidUpiId(upiId: string): boolean {
  const trimmed = upiId.trim();
  return trimmed.includes('@') && !trimmed.includes(' ');
}

/**
 * Builds a proper UPI URL with mandatory params
 * Does NOT include amount (am) - user enters manually
 */
export function buildUpiUrl(args: { pa: string; pn?: string; tn?: string; bookingId?: string }): string {
  const pa = args.pa.trim();
  const pn = encodeURIComponent(args.pn || 'Worker');
  const tn = encodeURIComponent(args.tn || `Service payment - Booking ${args.bookingId || 'N/A'}`);
  const cu = 'INR';
  
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${pn}&tn=${tn}&cu=${cu}`;
}

export async function launchUpiPayment(args: LaunchArgs): Promise<boolean> {
  const pa = args.pa?.trim();
  
  // Validate UPI ID
  if (!pa || !isValidUpiId(pa)) {
    toast.error('Invalid worker UPI id. Please update.');
    console.error('[UPI] Invalid UPI ID:', pa);
    return false;
  }
  
  const upiUrl = buildUpiUrl({
    pa,
    pn: args.pn,
    tn: args.tn,
    bookingId: args.bookingId,
  });
  
  console.log('[UPI] Generated URL:', upiUrl);
  
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    try { 
      window.location.href = upiUrl; 
    } catch { 
      await AppLauncher.openUrl({ url: upiUrl }); 
    }
    return true;
  }

  if (platform === 'ios') {
    // Always let the user choose on iOS
    args.onNeedChooser?.(true);
    return true;
  }

  await AppLauncher.openUrl({ url: upiUrl });
  return true;
}