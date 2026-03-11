import { supabase } from '@/integrations/supabase/client';
import { initiateRazorpayPayment, loadRazorpayScript } from './razorpay';

/**
 * Handles payment using wallet balance first, then Razorpay for the remainder.
 * 
 * Flow:
 * 1. Check wallet balance
 * 2. If wallet covers full amount → debit wallet, mark as wallet_paid
 * 3. If wallet covers partial → debit wallet, create Razorpay order for remainder
 * 4. If no wallet balance → full Razorpay payment
 * 
 * Returns booking_id on success, throws on failure.
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
    const { error } = await supabase.rpc('debit_wallet_for_booking', {
      p_booking_id: bookingId,
      p_amount: totalPrice,
    });
    if (error) throw new Error(error.message || 'Wallet payment failed');
    return bookingId;
  }

  if (walletBalance > 0) {
    // Partial wallet + Razorpay
    // First debit wallet
    const { error } = await supabase.rpc('debit_wallet_for_booking', {
      p_booking_id: bookingId,
      p_amount: walletBalance,
    });
    if (error) throw new Error(error.message || 'Wallet debit failed');

    // Update booking price to remainder for Razorpay
    const remainder = totalPrice - walletBalance;
    await supabase
      .from('bookings')
      .update({ price_inr: remainder })
      .eq('id', bookingId);

    // Then Razorpay for remainder
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
