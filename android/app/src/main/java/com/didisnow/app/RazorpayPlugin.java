package com.didisnow.app;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "RazorpayNative")
public class RazorpayPlugin extends Plugin implements PaymentResultWithDataListener {

    private static final String TAG = "RazorpayPlugin";
    private PluginCall savedCall;

    @Override
    public void load() {
        super.load();
        // Pre-load Razorpay for faster checkout opens
        Checkout.preload(getContext());
        Log.d(TAG, "Razorpay SDK preloaded");
    }

    @PluginMethod()
    public void openCheckout(PluginCall call) {
        String key = call.getString("key");
        Integer amount = call.getInt("amount");
        String currency = call.getString("currency", "INR");
        String orderId = call.getString("order_id");
        String name = call.getString("name", "Didi Now");
        String description = call.getString("description", "");
        String prefillContact = call.getString("prefill_contact", "");
        String prefillName = call.getString("prefill_name", "");
        String themeColor = call.getString("theme_color", "#ec4899");

        // Detailed input logging
        Log.d(TAG, "╔══════════════════════════════════════════");
        Log.d(TAG, "║ RAZORPAY CHECKOUT INPUT");
        Log.d(TAG, "╠══════════════════════════════════════════");
        Log.d(TAG, "║ key: " + (key != null ? key.substring(0, Math.min(12, key.length())) + "..." : "NULL"));
        Log.d(TAG, "║ key_type: " + (key != null && key.startsWith("rzp_live") ? "LIVE" : key != null && key.startsWith("rzp_test") ? "TEST" : "UNKNOWN"));
        Log.d(TAG, "║ amount (paise): " + amount);
        Log.d(TAG, "║ amount (INR): " + (amount != null ? amount / 100.0 : "NULL"));
        Log.d(TAG, "║ currency: " + currency);
        Log.d(TAG, "║ order_id: " + orderId);
        Log.d(TAG, "║ name: " + name);
        Log.d(TAG, "║ description: " + description);
        Log.d(TAG, "║ prefill_contact: " + (prefillContact.isEmpty() ? "EMPTY" : "***" + prefillContact.substring(Math.max(0, prefillContact.length() - 4))));
        Log.d(TAG, "║ prefill_name: " + (prefillName.isEmpty() ? "EMPTY" : prefillName));
        Log.d(TAG, "╚══════════════════════════════════════════");

        if (key == null || orderId == null || amount == null) {
            Log.e(TAG, "❌ Missing required fields: key=" + (key == null) + " orderId=" + (orderId == null) + " amount=" + (amount == null));
            call.reject("Missing required fields: key, order_id, amount");
            return;
        }

        // Save call for async callback
        savedCall = call;

        try {
            JSONObject options = new JSONObject();
            options.put("key", key);
            options.put("amount", amount);
            options.put("currency", currency);
            options.put("order_id", orderId);
            options.put("name", name);
            options.put("description", description);

            JSONObject prefill = new JSONObject();
            if (!prefillContact.isEmpty()) prefill.put("contact", prefillContact);
            if (!prefillName.isEmpty()) prefill.put("name", prefillName);
            options.put("prefill", prefill);

            JSONObject theme = new JSONObject();
            theme.put("color", themeColor);
            options.put("theme", theme);

            Log.d(TAG, "Opening native Razorpay checkout for order: " + orderId);

            Activity activity = getActivity();
            Checkout checkout = new Checkout();
            checkout.setKeyID(key);
            checkout.setImage(R.mipmap.ic_launcher);
            checkout.open(activity, options);

        } catch (JSONException e) {
            Log.e(TAG, "JSON error building checkout options", e);
            savedCall = null;
            call.reject("Failed to build checkout options: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error opening Razorpay checkout", e);
            savedCall = null;
            call.reject("Failed to open checkout: " + e.getMessage());
        }
    }

    // --- PaymentResultWithDataListener callbacks ---

    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        Log.d(TAG, "╔══════════════════════════════════════════");
        Log.d(TAG, "║ ✅ PAYMENT SUCCESS");
        Log.d(TAG, "║ payment_id: " + paymentData.getPaymentId());
        Log.d(TAG, "║ order_id: " + paymentData.getOrderId());
        Log.d(TAG, "║ signature: " + (paymentData.getSignature() != null ? paymentData.getSignature().substring(0, Math.min(20, paymentData.getSignature().length())) + "..." : "NULL"));
        Log.d(TAG, "╚══════════════════════════════════════════");
        if (savedCall != null) {
            JSObject result = new JSObject();
            result.put("razorpay_payment_id", paymentData.getPaymentId());
            result.put("razorpay_order_id", paymentData.getOrderId());
            result.put("razorpay_signature", paymentData.getSignature());
            savedCall.resolve(result);
            savedCall = null;
        }
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        Log.e(TAG, "╔══════════════════════════════════════════");
        Log.e(TAG, "║ ❌ PAYMENT ERROR");
        Log.e(TAG, "║ code: " + code);
        Log.e(TAG, "║ description: " + description);
        Log.e(TAG, "║ user_cancelled: " + (code == 2));
        if (paymentData != null) {
            Log.e(TAG, "║ payment_id: " + paymentData.getPaymentId());
            Log.e(TAG, "║ order_id: " + paymentData.getOrderId());
        }
        Log.e(TAG, "╚══════════════════════════════════════════");
        if (savedCall != null) {
            JSObject error = new JSObject();
            error.put("code", code);
            error.put("description", description != null ? description : "Payment failed");
            // Razorpay error code 2 = user cancelled / dismissed
            error.put("user_cancelled", code == 2);
            savedCall.reject(
                code == 2 ? "Payment cancelled by user" : (description != null ? description : "Payment failed"),
                String.valueOf(code),
                error
            );
            savedCall = null;
        }
    }
}
