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
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Capacitor plugin that wraps the Razorpay Android SDK.
 * This enables native UPI intent flows (PhonePe, GPay, Paytm, etc.)
 * which are impossible through checkout.js in a WebView.
 */
@CapacitorPlugin(name = "RazorpayNative")
public class RazorpayPlugin extends Plugin implements PaymentResultWithDataListener {

    private static final String TAG = "RazorpayPlugin";
    private PluginCall savedCall;

    @PluginMethod
    public void pay(PluginCall call) {
        String keyId = call.getString("key");
        String orderId = call.getString("order_id");
        Integer amount = call.getInt("amount");
        String currency = call.getString("currency", "INR");
        String name = call.getString("name", "Didi Now");
        String description = call.getString("description", "Service Payment");
        String prefillEmail = call.getString("prefill_email", "");
        String prefillPhone = call.getString("prefill_phone", "");
        String prefillName = call.getString("prefill_name", "");
        String themeColor = call.getString("theme_color", "#6366f1");

        if (keyId == null || orderId == null || amount == null) {
            call.reject("Missing required fields: key, order_id, amount");
            return;
        }

        savedCall = call;

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        try {
            Checkout checkout = new Checkout();
            checkout.setKeyID(keyId);

            // Pre-fetch for faster loading
            Checkout.preload(activity.getApplicationContext());

            JSONObject options = new JSONObject();
            options.put("name", name);
            options.put("description", description);
            options.put("order_id", orderId);
            options.put("currency", currency);
            options.put("amount", amount); // in paise

            JSONObject prefill = new JSONObject();
            if (!prefillEmail.isEmpty()) prefill.put("email", prefillEmail);
            if (!prefillPhone.isEmpty()) prefill.put("contact", prefillPhone);
            if (!prefillName.isEmpty()) prefill.put("name", prefillName);
            options.put("prefill", prefill);

            JSONObject theme = new JSONObject();
            theme.put("color", themeColor);
            options.put("theme", theme);

            // Enable UPI intent explicitly
            JSONObject config = new JSONObject();
            JSONObject display = new JSONObject();
            JSONObject blocks = new JSONObject();

            // UPI apps block — shows installed UPI apps for one-tap payment
            JSONObject upiBlock = new JSONObject();
            upiBlock.put("name", "Pay using UPI App");
            JSONObject upiInstrument = new JSONObject();
            upiInstrument.put("method", "upi");
            // Prefer intent flow (opens app), then collect, then QR
            org.json.JSONArray flows = new org.json.JSONArray();
            flows.put("intent");
            flows.put("collect");
            flows.put("qr");
            upiInstrument.put("flows", flows);
            org.json.JSONArray instruments = new org.json.JSONArray();
            instruments.put(upiInstrument);
            upiBlock.put("instruments", instruments);
            blocks.put("upi_apps", upiBlock);

            display.put("blocks", blocks);

            org.json.JSONArray sequence = new org.json.JSONArray();
            sequence.put("block.upi_apps");
            display.put("sequence", sequence);

            JSONObject preferences = new JSONObject();
            preferences.put("show_default_blocks", true);
            display.put("preferences", preferences);

            config.put("display", display);
            options.put("config", config);

            Log.d(TAG, "Opening Razorpay native checkout with UPI intent support");
            checkout.open(activity, options);

        } catch (JSONException e) {
            Log.e(TAG, "JSON error building options", e);
            call.reject("Failed to build payment options: " + e.getMessage());
            savedCall = null;
        } catch (Exception e) {
            Log.e(TAG, "Error opening Razorpay", e);
            call.reject("Failed to open Razorpay: " + e.getMessage());
            savedCall = null;
        }
    }

    @Override
    public void onPaymentSuccess(String paymentId, PaymentData paymentData) {
        Log.d(TAG, "Payment success: " + paymentId);
        if (savedCall != null) {
            JSObject result = new JSObject();
            result.put("razorpay_payment_id", paymentData.getPaymentId());
            result.put("razorpay_order_id", paymentData.getOrderId());
            result.put("razorpay_signature", paymentData.getSignature());
            result.put("status", "success");
            savedCall.resolve(result);
            savedCall = null;
        }
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        Log.e(TAG, "Payment error [" + code + "]: " + description);
        if (savedCall != null) {
            JSObject result = new JSObject();
            result.put("status", code == 2 ? "cancelled" : "failed");
            result.put("error_code", code);
            result.put("error_description", description != null ? description : "Payment failed");
            if (paymentData != null && paymentData.getOrderId() != null) {
                result.put("razorpay_order_id", paymentData.getOrderId());
            }
            // Resolve (not reject) so the frontend can handle statuses uniformly
            savedCall.resolve(result);
            savedCall = null;
        }
    }

    @PluginMethod
    public void preload(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            Checkout.preload(activity.getApplicationContext());
            Log.d(TAG, "Razorpay preloaded");
        }
        call.resolve();
    }
}
