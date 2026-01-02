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
 * Builds minimal UPI URL - only pa (UPI ID) required
 * Banks reject complex URLs with long transaction notes
 */
export function buildUpiUrl(args: { pa: string }): string {
  const pa = args.pa.trim();
  return `upi://pay?pa=${encodeURIComponent(pa)}`;
}

export async function launchUpiPayment(args: LaunchArgs): Promise<boolean> {
  const pa = args.pa?.trim();
  
  // Validate UPI ID
  if (!pa || !isValidUpiId(pa)) {
    toast.error('Invalid worker UPI id. Please update.');
    console.error('[UPI] Invalid UPI ID:', pa);
    return false;
  }
  
  const upiUrl = buildUpiUrl({ pa });
  
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