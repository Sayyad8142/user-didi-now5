import { supabase } from '@/integrations/supabase/client';
import { initiateRazorpayPayment, loadRazorpayScript } from './razorpay';

/**
 * Handles payment using wallet balance first, then Razorpay for the remainder.
 */
export async function payWithWalletThenRazorpay(
  bookingId: string,
  profileId: string,
  totalPrice: number
): Promise<string> {
  // 1. Fetch wallet balance
  const { data: wallet } = await supabase
    .from('user_wallets')
    .select('balance_inr')
    .eq('user_id', profileId)
    .maybeSingle();

  const walletBalance = wallet?.balance_inr ?? 0;

  if (walletBalance >= totalPrice) {
    // Full wallet payment
    const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
      p_booking_id: bookingId,
      p_amount: totalPrice,
    });
    if (error) throw new Error(error.message || 'Wallet payment failed');
    return bookingId;
  }

  if (walletBalance > 0) {
    // Partial wallet + Razorpay
    const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
      p_booking_id: bookingId,
      p_amount: walletBalance,
    });
    if (error) throw new Error(error.message || 'Wallet debit failed');

    // Update booking price to remainder for Razorpay order
    const remainder = totalPrice - walletBalance;
    await supabase
      .from('bookings')
      .update({ price_inr: remainder })
      .eq('id', bookingId);

    // Razorpay for remainder
    await initiateRazorpayPayment(bookingId);

    // Restore original price after payment
    await supabase
      .from('bookings')
      .update({ price_inr: totalPrice })
      .eq('id', bookingId);

    return bookingId;
  }

  // No wallet balance — full Razorpay
  await loadRazorpayScript();
  await initiateRazorpayPayment(bookingId);
  return bookingId;
}
