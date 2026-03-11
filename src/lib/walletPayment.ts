import { supabase } from '@/integrations/supabase/client';
import { initiateRazorpayPayment, initiateIntentPayment } from './razorpay';

/**
 * Intent-based payment: wallet first, then Razorpay.
 * No booking row exists yet — it's created server-side after payment.
 * Returns the new booking ID.
 */
export async function payIntentWithWalletThenRazorpay(
  bookingData: Record<string, unknown>,
  profileId: string,
  totalPrice: number
): Promise<string> {
  let walletBalance = 0;

  // 1. Try fetch wallet balance
  try {
    console.log('💰 [Wallet] Fetching balance for intent flow...');
    const { data: wallet, error } = await supabase
      .from('user_wallets')
      .select('balance_inr')
      .eq('user_id', profileId)
      .maybeSingle();

    if (!error && wallet) {
      walletBalance = wallet.balance_inr ?? 0;
      console.log('💰 [Wallet] Balance:', walletBalance);
    }
  } catch (err) {
    console.warn('⚠️ [Wallet] Balance fetch failed, skipping:', err);
  }

  // 2. Full wallet payment (no Razorpay needed)
  if (walletBalance >= totalPrice) {
    try {
      console.log('💰 [Wallet] Full wallet payment for intent:', totalPrice);
      // Create booking directly with wallet payment
      const insertRow = {
        ...bookingData,
        payment_status: 'wallet_paid',
        payment_method: 'wallet',
        paid_confirmed_at: new Date().toISOString(),
      } as any;
      const { data: newBooking, error: insertError } = await supabase
        .from('bookings')
        .insert([insertRow])
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Debit wallet
      const { error: debitError } = await (supabase.rpc as any)('debit_wallet_for_booking', {
        p_booking_id: newBooking.id,
        p_amount: totalPrice,
      });
      if (debitError) throw debitError;

      console.log('✅ [Wallet] Full wallet payment successful, booking:', newBooking.id);
      return newBooking.id;
    } catch (err) {
      console.warn('⚠️ [Wallet] Full wallet debit failed, falling back to Razorpay:', err);
    }
  }

  // 3. Partial wallet + Razorpay
  if (walletBalance > 0 && walletBalance < totalPrice) {
    // For partial, we reduce the Razorpay amount but store original price in booking
    const remainder = totalPrice - walletBalance;
    console.log('💰 [Wallet] Partial wallet:', walletBalance, 'remainder:', remainder);

    try {
      // Pay remainder via Razorpay (booking created server-side with remainder price)
      const intentData = { ...bookingData, price_inr: remainder };
      const bookingId = await initiateIntentPayment(intentData, remainder);

      // Debit wallet for the partial amount
      try {
        await (supabase.rpc as any)('debit_wallet_for_booking', {
          p_booking_id: bookingId,
          p_amount: walletBalance,
        });
        // Update booking to reflect full price
        await supabase
          .from('bookings')
          .update({ price_inr: totalPrice })
          .eq('id', bookingId);
      } catch (walletErr) {
        console.warn('⚠️ [Wallet] Partial debit failed after Razorpay success:', walletErr);
        // Booking is still valid — Razorpay already paid the remainder
      }

      return bookingId;
    } catch (err: any) {
      if (err?.message?.includes('Payment cancelled') || err?.message?.includes('Payment failed') || err?.message?.includes('Payment verification')) {
        throw err;
      }
      console.warn('⚠️ [Wallet] Partial flow failed, trying full Razorpay:', err);
    }
  }

  // 4. Full Razorpay (no wallet or wallet failed)
  console.log('🚀 [Payment] Full Razorpay intent payment');
  return await initiateIntentPayment(bookingData, totalPrice);
}

/**
 * Legacy booking-based payment: wallet first, then Razorpay.
 * Booking row already exists (for scheduled bookings).
 */
export async function payWithWalletThenRazorpay(
  bookingId: string,
  profileId: string,
  totalPrice: number
): Promise<string> {
  let walletBalance = 0;

  try {
    const { data: wallet, error } = await supabase
      .from('user_wallets')
      .select('balance_inr')
      .eq('user_id', profileId)
      .maybeSingle();

    if (!error) walletBalance = wallet?.balance_inr ?? 0;
  } catch (err) {
    console.warn('⚠️ [Wallet] Balance fetch failed, skipping:', err);
  }

  if (walletBalance >= totalPrice) {
    try {
      const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
        p_booking_id: bookingId,
        p_amount: totalPrice,
      });
      if (error) throw error;
      return bookingId;
    } catch (err) {
      console.warn('⚠️ [Wallet] Full debit failed, falling back to Razorpay:', err);
    }
  }

  if (walletBalance > 0 && walletBalance < totalPrice) {
    try {
      const { error } = await (supabase.rpc as any)('debit_wallet_for_booking', {
        p_booking_id: bookingId,
        p_amount: walletBalance,
      });
      if (error) throw error;

      const remainder = totalPrice - walletBalance;
      await supabase.from('bookings').update({ price_inr: remainder }).eq('id', bookingId);
      await initiateRazorpayPayment(bookingId);
      await supabase.from('bookings').update({ price_inr: totalPrice }).eq('id', bookingId);
      return bookingId;
    } catch (err: any) {
      if (err?.message?.includes('Payment cancelled') || err?.message?.includes('Payment failed') || err?.message?.includes('Payment verification')) {
        throw err;
      }
      console.warn('⚠️ [Wallet] Partial flow failed, falling back:', err);
    }
  }

  await initiateRazorpayPayment(bookingId);
  return bookingId;
}
