import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { toast } from 'sonner';

export type UpiPaymentParams = {
  pa: string;           // UPI ID (required)
  pn?: string;          // Payee name
  am?: number;          // Amount (2 decimal places)
  bookingId?: string;   // For transaction note
  onNeedChooser?: (v: boolean) => void;
  onPaymentReturn?: () => void; // Callback when user returns from UPI app
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
 * Generates a unique transaction reference using timestamp
 */
function generateTransactionRef(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIDI${timestamp}${random}`;
}

/**
 * URL encode helper
 */
const enc = (v: string) => encodeURIComponent(v?.trim() ?? '');

/**
 * Builds complete UPI URL with all required parameters
 * Format: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...&tr=...
 */
export function buildUpiUrl(args: {
  pa: string;
  pn?: string;
  am?: number;
  bookingId?: string;
}): string {
  const pa = args.pa.trim();
  const pn = args.pn?.trim() || 'Didi Now Worker';
  const tn = args.bookingId 
    ? `Didi Now booking #${args.bookingId.substring(0, 8)}`
    : 'Didi Now service payment';
  const tr = generateTransactionRef();
  
  // Build URL with all parameters
  let url = `upi://pay?pa=${enc(pa)}&pn=${enc(pn)}&cu=INR&tn=${enc(tn)}&tr=${enc(tr)}`;
  
  // Add amount only if provided and valid
  if (args.am && args.am > 0) {
    url += `&am=${args.am.toFixed(2)}`;
  }
  
  return url;
}

/**
 * Checks if UPI apps are available on the device
 */
async function canOpenUpi(): Promise<boolean> {
  try {
    const testUrl = 'upi://pay?pa=test@upi';
    const result = await AppLauncher.canOpenUrl({ url: testUrl });
    return result.value;
  } catch {
    return false;
  }
}

export async function launchUpiPayment(args: UpiPaymentParams): Promise<boolean> {
  const pa = args.pa?.trim();
  
  // Validation: UPI ID must contain @
  if (!pa || !isValidUpiId(pa)) {
    toast.error('Invalid worker UPI ID. Please contact support.');
    console.error('[UPI] Invalid UPI ID:', pa);
    return false;
  }
  
  // Validation: Amount must be > 0 if provided
  if (args.am !== undefined && args.am <= 0) {
    toast.error('Invalid payment amount.');
    console.error('[UPI] Invalid amount:', args.am);
    return false;
  }
  
  const upiUrl = buildUpiUrl({
    pa,
    pn: args.pn,
    am: args.am,
    bookingId: args.bookingId,
  });
  
  console.log('[UPI] Generated URL:', upiUrl);
  
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    try {
      // First check if any UPI app is available
      const hasUpiApp = await canOpenUpi();
      if (!hasUpiApp) {
        toast.error('No UPI app found. Please install GPay, PhonePe, or Paytm.');
        return false;
      }
      
      // Use AppLauncher for reliable deep link handling on Android
      await AppLauncher.openUrl({ url: upiUrl });
      
      // Trigger callback for confirmation dialog
      args.onPaymentReturn?.();
      return true;
    } catch (error) {
      console.error('[UPI] AppLauncher failed:', error);
      
      // Fallback to window.location.href
      try {
        window.location.href = upiUrl;
        args.onPaymentReturn?.();
        return true;
      } catch (fallbackError) {
        console.error('[UPI] Fallback failed:', fallbackError);
        toast.error('Could not open UPI app. Please try again.');
        return false;
      }
    }
  }

  if (platform === 'ios') {
    // iOS: Always show app chooser for better UX
    args.onNeedChooser?.(true);
    return true;
  }

  // Web fallback
  try {
    await AppLauncher.openUrl({ url: upiUrl });
    args.onPaymentReturn?.();
    return true;
  } catch {
    // On web, show chooser as fallback
    args.onNeedChooser?.(true);
    return true;
  }
}
