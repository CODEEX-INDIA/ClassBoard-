package com.classboard.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen awake during presentation — boards are always-on.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Disable system font scaling inside WebView (presentation layout
        // must not reflow when Android font scale is changed).
        // The WebView host respects textZoom=100; CSS also has text-size-adjust:none.
        this.bridge.ifPresent(bridge -> {
            WebView wv = bridge.getWebView();
            if (wv != null) {
                wv.getSettings().setTextZoom(100);
                wv.getSettings().setSupportZoom(false);
                // Hardware acceleration already on via manifest, but ensure here too
                wv.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
            }
        });
    }

    // Optional: handle PDF share intents by forwarding to the web app's
    // navigator.share_target handler. Capacitor's App plugin already
    // surfaces this; no extra code needed here for basic flow.
}
