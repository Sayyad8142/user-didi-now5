package com.didisnow.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

public class MainActivity extends BridgeActivity implements PaymentResultWithDataListener {

    private RazorpayPlugin razorpayPlugin;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RazorpayPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Cache plugin reference for callbacks
        if (razorpayPlugin == null) {
            razorpayPlugin = (RazorpayPlugin) getBridge().getPlugin("RazorpayNative").getInstance();
        }
    }

    @Override
    public void onPaymentSuccess(String paymentId, PaymentData paymentData) {
        if (razorpayPlugin != null) {
            razorpayPlugin.onPaymentSuccess(paymentId, paymentData);
        }
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        if (razorpayPlugin != null) {
            razorpayPlugin.onPaymentError(code, description, paymentData);
        }
    }
}
