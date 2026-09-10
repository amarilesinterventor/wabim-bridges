package com.wabim.bridges;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Refuerzo nativo del "user-scalable=no" del <meta viewport>: en algunos
        // WebView de Android el meta viewport por sí solo no basta para bloquear
        // el pellizco-zoom (p.ej. si el usuario alcanza a pellizcar antes de que
        // la página termine de cargar), dejando la página "más grande que la
        // pantalla" y obligando a desplazarse con el dedo para ver el resto —
        // justamente el problema reportado. Esta es una app empaquetada (no un
        // sitio web público), así que deshabilitar el zoom por completo es
        // apropiado: el contenido ya está diseñado para ajustarse a la pantalla.
        getBridge().getWebView().getSettings().setSupportZoom(false);
        getBridge().getWebView().getSettings().setBuiltInZoomControls(false);
        getBridge().getWebView().getSettings().setDisplayZoomControls(false);
    }
}
