import { KeyRound, Eye, Lock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VisibleOtp } from './otpContract';
import { shareOtpOnWhatsApp } from '@/lib/whatsappShare';
import { toast } from 'sonner';

export function BookingOtpDisplay({ value, gated = false, onReveal, workerName, serviceType, amount }: {
  value: VisibleOtp | null;
  gated?: boolean;
  onReveal?: () => void;
  workerName?: string | null;
  serviceType?: string | null;
  amount?: number | null;
}) {
  if (!value) return null;
  const title = value.type === 'start' ? 'Booking Start OTP' : 'Booking Completion OTP';
  const description = value.type === 'start'
    ? 'Share this code with your worker when they arrive to start the service.'
    : 'Share this code only after your worker finishes the service.';
  return (
    <section aria-label={title} className="my-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-primary">
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div aria-label={gated ? 'Code hidden until rating' : title} className="mt-3 flex justify-center gap-2">
        {value.otp.split('').map((digit, i) => (
          <span key={i} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-background text-xl font-bold tabular-nums text-foreground">
            {gated ? '•' : digit}
          </span>
        ))}
      </div>
      {gated ? (
        <Button variant="outline" className="mt-3 h-auto min-h-10 w-full whitespace-normal text-xs" onClick={onReveal}>
          <Eye className="mr-2 h-4 w-4 shrink-0" /><Lock className="mr-1 h-3 w-3 shrink-0" />
          Rate your last service to reveal OTP
        </Button>
      ) : value.mode === 'legacy' ? (
        <Button variant="outline" className="mt-3 w-full text-xs" onClick={async () => {
          const ok = await shareOtpOnWhatsApp({ otp: value.otp, workerName, serviceType, amount });
          if (!ok) toast.error('WhatsApp is not installed on this device.');
        }}>
          <MessageCircle className="mr-2 h-4 w-4" />Share on WhatsApp
        </Button>
      ) : null}
    </section>
  );
}