package com.didisnow.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Switch off splash theme immediately before super.onCreate()
        setTheme(R.style.Theme_DidiNow);
        super.onCreate(savedInstanceState);
    }
}