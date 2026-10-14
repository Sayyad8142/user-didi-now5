import { otpStateKey, resolveVisibleOtp, type OtpBookingState, type OtpResponse, type VisibleOtp } from './otpContract';

/** Ephemeral, per-display session. Epochs reject late requests after clear/reassignment. */
export class OtpLifecycle {
  private epoch = 0;
  private key = '';
  private bookingId = '';
  private generation = -1;
  private v2 = false;

  begin(booking: OtpBookingState): number {
    if (booking.id !== this.bookingId) {
      this.bookingId = booking.id;
      this.generation = -1;
      this.v2 = false;
    }
    this.key = otpStateKey(booking);
    return ++this.epoch;
  }

  clear(): void { this.epoch++; }

  accept(epoch: number, booking: OtpBookingState, response: OtpResponse | null, enabled: boolean): VisibleOtp | null {
    if (epoch !== this.epoch || otpStateKey(booking) !== this.key) return null;
    if (response && 'otp_mode' in response && response.otp_mode === 'v2') {
      this.v2 = true;
      if (response.available) {
        if (response.assignment_generation < this.generation) return null;
        this.generation = response.assignment_generation;
      }
    }
    if (this.v2 && !(response && 'otp_mode' in response && response.otp_mode === 'v2')) return null;
    return resolveVisibleOtp(booking, response, enabled);
  }
}