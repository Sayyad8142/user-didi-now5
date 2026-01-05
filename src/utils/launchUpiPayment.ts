import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { toast } from 'sonner';

export type UpiPaymentParams = {
  pa: string;           // UPI ID (required)
  pn?: string;          // Payee name
  am?: number;          // Amount (2 decimal places)
  bookingId?: string;   // For transaction note
  qrPayload?: string;   // Optional: decoded QR payload (upi://pay?... or pa=...)
  onNeedChooser?: (v: boolean) => void;
  onPaymentLaunched?: () => void; // Called when UPI app opens (set pending flag)
  onShowQrFallback?: () => void;  // Called when deep link fails and QR is available
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
export function generateTransactionRef(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIDI${timestamp}${random}`;
}

/**
 * URL encode helper
 */
const enc = (v: string) => encodeURIComponent(v?.trim() ?? '');

/**
 * Parses a UPI URL or payload and extracts parameters
 */
function parseUpiPayload(payload: string): Map<string, string> {
  const params = new Map<string, string>();
  
  // Handle upi://pay?... format
  let queryString = payload;
  if (payload.toLowerCase().startsWith('upi://pay?')) {
    queryString = payload.substring(10); // Remove 'upi://pay?'
  } else if (payload.toLowerCase().startsWith('upi://pay')) {
    queryString = payload.substring(9); // Remove 'upi://pay'
    if (queryString.startsWith('?')) queryString = queryString.substring(1);
  }
  
  // Parse query string
  const pairs = queryString.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      try {
        params.set(key.toLowerCase().trim(), decodeURIComponent(value.trim()));
      } catch {
        params.set(key.toLowerCase().trim(), value.trim());
      }
    }
  }
  
  return params;
}

/**
 * Check if a payload is a valid UPI payload
 */
export function isValidUpiPayload(payload?: string): boolean {
  if (!payload) return false;
  const trimmed = payload.trim().toLowerCase();
  return trimmed.startsWith('upi://pay') || trimmed.includes('pa=');
}

/**
 * Builds complete UPI URL with all required parameters
 * If qrPayload is provided, merges/overrides with provided params
 * Format: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...&tr=...
 */
export function buildUpiUrl(args: {
  pa: string;
  pn?: string;
  am?: number;
  bookingId?: string;
  qrPayload?: string;
}): string {
  // Start with QR payload params if available
  let baseParams = new Map<string, string>();
  
  if (args.qrPayload && isValidUpiPayload(args.qrPayload)) {
    baseParams = parseUpiPayload(args.qrPayload);
  }
  
  // Get UPI ID: prefer explicit pa, fallback to QR's pa
  const pa = args.pa?.trim() || baseParams.get('pa') || '';
  const pn = args.pn?.trim() || baseParams.get('pn') || 'Didi Now Worker';
  const tn = args.bookingId 
    ? `Didi Now booking #${args.bookingId.substring(0, 8)}`
    : 'Didi Now service payment';
  const tr = generateTransactionRef();
  
  // Build URL - always override with our params for consistency
  let url = `upi://pay?pa=${enc(pa)}&pn=${enc(pn)}&cu=INR&tn=${enc(tn)}&tr=${enc(tr)}`;
  
  // Add amount only if provided and valid
  if (args.am && args.am > 0) {
    url += `&am=${args.am.toFixed(2)}`;
  }
  
  return url;
}

/**
 * Checks if UPI apps are available on the device
 * Uses complete probe URL for reliable detection
 */
async function canOpenUpi(): Promise<boolean> {
  try {
    // Use complete probe URL with all required params
    const probeUrl = 'upi://pay?pa=test@upi&pn=Test&cu=INR&tn=Probe&tr=PROBE123';
    const result = await AppLauncher.canOpenUrl({ url: probeUrl });
    return result.value;
  } catch {
    return false;
  }
}

export async function launchUpiPayment(args: UpiPaymentParams): Promise<boolean> {
  // Determine effective UPI ID
  let effectivePa = args.pa?.trim() || '';
  
  // If QR payload available, try to extract pa from it
  if (args.qrPayload && isValidUpiPayload(args.qrPayload)) {
    const qrParams = parseUpiPayload(args.qrPayload);
    const qrPa = qrParams.get('pa');
    if (qrPa && isValidUpiId(qrPa)) {
      effectivePa = effectivePa || qrPa;
    }
  }
  
  // Validation: UPI ID must contain @
  if (!effectivePa || !isValidUpiId(effectivePa)) {
    toast.error('Invalid worker UPI ID. Please contact support.');
    console.error('[UPI] Invalid UPI ID:', effectivePa);
    return false;
  }
  
  // Validation: Amount must be > 0 if provided
  if (args.am !== undefined && args.am <= 0) {
    toast.error('Invalid payment amount.');
    console.error('[UPI] Invalid amount:', args.am);
    return false;
  }
  
  const upiUrl = buildUpiUrl({
    pa: effectivePa,
    pn: args.pn,
    am: args.am,
    bookingId: args.bookingId,
    qrPayload: args.qrPayload,
  });
  
  console.log('[UPI] Generated URL:', upiUrl);
  
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    // Note: AppLauncher.canOpenUrl() can produce false negatives on Android 11+
    // due to package visibility restrictions in the native manifest.
    // So we do an optimistic open first and only show "no app" if opening fails.
    let hasUpiApp = true;
    try {
      hasUpiApp = await canOpenUpi();
      if (!hasUpiApp) console.warn('[UPI] canOpenUpi=false (may be false-negative on Android 11+)');
    } catch {
      hasUpiApp = true;
    }

    try {
      // Use AppLauncher for reliable deep link handling on Android
      await AppLauncher.openUrl({ url: upiUrl });

      // Signal that payment was launched - caller should set pending flag
      args.onPaymentLaunched?.();
      return true;
    } catch (error) {
      console.error('[UPI] AppLauncher failed:', error);

      // Fallback to window.location.href
      try {
        window.location.href = upiUrl;
        args.onPaymentLaunched?.();
        return true;
      } catch (fallbackError) {
        console.error('[UPI] Fallback failed:', fallbackError);
        
        // If QR is available, offer that as fallback
        if (args.onShowQrFallback) {
          args.onShowQrFallback();
          return false;
        }
        
        toast.error(
          hasUpiApp
            ? 'Could not open UPI app. Please try again.'
            : 'No UPI app found. Please install GPay, PhonePe, or Paytm.'
        );
        return false;
      }
    }
  }

  if (platform === 'ios') {
    // iOS: Always show app chooser for better UX
    args.onNeedChooser?.(true);
    return true;
  }

  // Web fallback - show chooser
  args.onNeedChooser?.(true);
  return true;
}
