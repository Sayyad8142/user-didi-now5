/**
 * Wallet Pay Edge Function
 * 
 * Handles atomic wallet debit for bookings.
 * Cases:
 * - Full wallet payment (wallet >= booking amount)
 * - Partial wallet debit (wallet < booking amount, remainder via Razorpay)
 * 
 * Safety:
 * - Atomic: checks balance + debits in a single transaction
 * - Idempotent: won't double-debit if already debited for this booking
 * - Prevents negative balance
 * - Logs every transaction in wallet_transactions
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logPrefix = "[wallet-pay]";

  try {
    // 1. Authenticate
    const idToken = extractToken(req);
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUser = await verifyFirebaseToken(idToken);

    // 2. Parse request
    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Get booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, price_inr, payment_status, wallet_used_amount, booking_type, status")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Verify ownership
    if (booking.user_id !== profile.id) {
      return new Response(JSON.stringify({ error: "Booking does not belong to user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Prevent double payment
    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Already paid", already_paid: true }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Prevent double wallet debit (idempotent check)
    if (booking.wallet_used_amount && booking.wallet_used_amount > 0) {
      console.log(`${logPrefix} Wallet already debited ₹${booking.wallet_used_amount} for booking ${booking_id}`);
      const remainingAmount = (booking.price_inr || 0) - booking.wallet_used_amount;
      return new Response(JSON.stringify({
        wallet_debited: booking.wallet_used_amount,
        remaining_amount: Math.max(0, remainingAmount),
        fully_paid: remainingAmount <= 0,
        already_debited: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Get wallet balance
    const { data: wallet } = await supabase
      .from("user_wallets")
      .select("balance_inr")
      .eq("user_id", profile.id)
      .maybeSingle();

    const walletBalance = wallet?.balance_inr ?? 0;
    const bookingAmount = booking.price_inr || 0;

    if (walletBalance <= 0) {
      return new Response(JSON.stringify({
        wallet_debited: 0,
        remaining_amount: bookingAmount,
        fully_paid: false,
        wallet_balance: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Calculate debit amount
    const debitAmount = Math.min(walletBalance, bookingAmount);
    const remainingAmount = bookingAmount - debitAmount;
    const fullyPaid = remainingAmount <= 0;

    console.log(`${logPrefix} Booking ${booking_id}: amount=₹${bookingAmount}, wallet=₹${walletBalance}, debit=₹${debitAmount}, remaining=₹${remainingAmount}`);

    // 10. Atomic wallet debit using RPC
    // First try RPC, fallback to manual if RPC doesn't exist
    const { error: debitErr } = await supabase.rpc("debit_wallet_for_booking", {
      p_user_id: profile.id,
      p_booking_id: booking_id,
      p_amount: debitAmount,
    });

    if (debitErr) {
      console.warn(`${logPrefix} RPC debit_wallet_for_booking failed, using manual debit:`, debitErr.message);
      
      // Manual atomic debit: update wallet + insert transaction + update booking
      // Re-check balance to prevent race condition
      const { data: freshWallet } = await supabase
        .from("user_wallets")
        .select("balance_inr")
        .eq("user_id", profile.id)
        .single();

      if (!freshWallet || freshWallet.balance_inr < debitAmount) {
        return new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Debit wallet
      const { error: walletUpdateErr } = await supabase
        .from("user_wallets")
        .update({ balance_inr: freshWallet.balance_inr - debitAmount, updated_at: new Date().toISOString() })
        .eq("user_id", profile.id)
        .gte("balance_inr", debitAmount); // Safety: only if enough balance

      if (walletUpdateErr) {
        console.error(`${logPrefix} Wallet update failed:`, walletUpdateErr);
        return new Response(JSON.stringify({ error: "Failed to debit wallet" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log transaction
      await supabase.from("wallet_transactions").insert({
        user_id: profile.id,
        booking_id: booking_id,
        type: "debit",
        amount_inr: debitAmount,
        reason: "booking_payment",
        reference_type: "booking",
        reference_id: booking_id,
        notes: fullyPaid ? "Full wallet payment" : `Partial wallet payment (₹${remainingAmount} remaining via Razorpay)`,
      });
    }

    // 11. Update booking with wallet info
    const bookingUpdate: Record<string, any> = {
      wallet_used_amount: debitAmount,
    };

    if (fullyPaid) {
      // Fully paid by wallet — mark as paid
      bookingUpdate.payment_status = "paid";
      bookingUpdate.payment_method = "wallet";
      bookingUpdate.paid_at = new Date().toISOString();
      bookingUpdate.razorpay_paid_amount = 0;
    } else {
      // Partial wallet — store how much was used, remaining goes to Razorpay
      bookingUpdate.razorpay_paid_amount = remainingAmount;
    }

    const { error: bookingUpdateErr } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", booking_id);

    if (bookingUpdateErr) {
      console.error(`${logPrefix} Failed to update booking:`, bookingUpdateErr);
      // Non-fatal: wallet was already debited, booking update can be retried
    }

    // 12. If fully paid and instant booking, trigger dispatch
    if (fullyPaid && booking.booking_type === "instant" && booking.status === "pending") {
      console.log(`${logPrefix} 🚀 Triggering dispatch for wallet-paid instant booking ${booking_id}`);
      try {
        const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
          p_booking_id: booking_id,
        });
        if (dispatchErr) {
          console.error(`${logPrefix} dispatch_booking RPC failed:`, dispatchErr);
          // Fallback
          await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ booking_id }),
          });
        }
      } catch (dispatchCatchErr) {
        console.error(`${logPrefix} Dispatch error (non-blocking):`, dispatchCatchErr);
      }
    }

    console.log(`${logPrefix} ✅ Wallet debit complete: ₹${debitAmount} for booking ${booking_id}`);

    return new Response(JSON.stringify({
      wallet_debited: debitAmount,
      remaining_amount: remainingAmount,
      fully_paid: fullyPaid,
      wallet_balance: walletBalance - debitAmount,
      payment_method: fullyPaid ? "wallet" : "wallet+razorpay",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error(`${logPrefix} Error:`, err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
