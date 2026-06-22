import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { prettyServiceName } from '@/features/booking/utils';

export interface OtpShareInput {
  workerName?: string | null;
  serviceType?: string | null;
  otp?: string | null;
  amount?: number | null;
}

export function buildOtpShareMessage(b: OtpShareInput): string {
  const worker = b.workerName?.trim() || 'Your service expert';
  const service = b.serviceType ? prettyServiceName(b.serviceType) : 'Home Service';
  const otp = (b.otp || '').trim() || '—';
  const amount = typeof b.amount === 'number' ? `₹${b.amount}` : '—';
  return [
    '🏠 *Didi Now Service Booking*',
    '',
    'Your service expert is on the way.',
    '',
    `👩 Expert: ${worker}`,
    `🧹 Service: ${service}`,
    `🔑 Check-in OTP: ${otp}`,
    `💰 Amount Paid: ${amount}`,
    '',
    'Please share this OTP with the expert only when they arrive at your location.',
    '',
    'Thank you for choosing Didi Now ❤️',
  ].join('\n');
}

/**
 * Open WhatsApp share with a prefilled message.
 * Returns true if launch was attempted successfully, false if WhatsApp seems unavailable.
 */
export async function shareOtpOnWhatsApp(input: OtpShareInput): Promise<boolean> {
  const text = buildOtpShareMessage(input);
  const encoded = encodeURIComponent(text);
  const native = Capacitor.isNativePlatform();

  if (native) {
    // Try the native WhatsApp scheme first so we can detect "not installed".
    const waUrl = `whatsapp://send?text=${encoded}`;
    try {
      const can = await AppLauncher.canOpenUrl({ url: 'whatsapp://send' });
      if (can.value) {
        await AppLauncher.openUrl({ url: waUrl });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Web: wa.me handles install-prompt / web fallback gracefully.
  try {
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}
