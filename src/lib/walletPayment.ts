import { supabase } from '@/integrations/supabase/client';
import { initiateRazorpayPayment } from './razorpay';

/**
 * Handles payment using wallet balance first, then Razorpay for the remainder.
 * If wallet system fails for any reason, falls back to full Razorpay.
 */
export async function payWithWalletThenRazorpay(
  bookingId: string,
  profileId: string,
  totalPrice: number
): Promise<string> {
  let walletBalance = 0;

  // 1. Try fetch wallet balance — if fails, just skip wallet
  try {
    console.log('💰 [Wallet] Fetching balance for user:', profileId);
    const { data: wallet, error } = await supabase
      .from('user_wallets')
      .select('balance_inr')
      .eq('user_id', profileId)
      .maybeSingle();

    if (error) {
      console.warn('⚠️ [Wallet] Balance fetch failed, skipping wallet:', error.message);
    } else {
      walletBalance = wallet?.balance_inr ?? 0;
      console.log('💰 [Wallet] Balance:', walletBalance);
    }
  } catch (err) {
    console.warn('⚠️ [Wallet] Balance fetch exception, skipping wallet:', err);
  }

  // 2. If wallet covers full amount, try wallet-only payment
  if (walletBalance >= totalPrice) {
    try {
      console.log('💰 [Wallet] Full wallet payment:', totalPrice);
      const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
        p_booking_id: bookingId,
        p_amount: totalPrice,
      });
      if (error) throw error;
      console.log('✅ [Wallet] Full wallet payment successful');
      return bookingId;
    } catch (err) {
      console.warn('⚠️ [Wallet] Full wallet debit failed, falling back to Razorpay:', err);
      // Fall through to Razorpay
    }
  }

  // 3. If partial wallet balance, try to debit it first
  if (walletBalance > 0 && walletBalance < totalPrice) {
    try {
      console.log('💰 [Wallet] Partial wallet debit:', walletBalance);
      const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
        p_booking_id: bookingId,
        p_amount: walletBalance,
      });
      if (error) throw error;

      // Update booking price to remainder for Razorpay
      const remainder = totalPrice - walletBalance;
      console.log('💰 [Wallet] Remainder for Razorpay:', remainder);
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
    } catch (err: any) {
      // If wallet debit failed, just do full Razorpay
      // If Razorpay failed, re-throw
      if (err?.message?.includes('Payment cancelled') || err?.message?.includes('Payment failed') || err?.message?.includes('Payment verification')) {
        throw err;
      }
      console.warn('⚠️ [Wallet] Partial wallet flow failed, falling back to full Razorpay:', err);
    }
  }

  // 4. Full Razorpay payment (no wallet or wallet failed)
  console.log('🚀 [Payment] Proceeding with full Razorpay payment');
  await initiateRazorpayPayment(bookingId);
  return bookingId;
}
