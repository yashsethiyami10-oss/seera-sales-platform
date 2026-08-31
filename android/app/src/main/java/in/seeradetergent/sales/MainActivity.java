package in.seeradetergent.sales;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Seera Android shell.
 *
 * The app intentionally loads the production web origin, so the web portal remains the single
 * business implementation. The native shell only adds lifecycle resilience that a browser cannot
 * provide: Android may kill/recreate the WebView process while the camera activity is open on
 * memory-constrained field devices. Persisting the last authenticated /portal URL lets the same
 * active-visit page resume instead of reopening the generic Sales Executive portal home.
 */
public class MainActivity extends BridgeActivity {
    private static final String PREFS = "seera_native_shell";
    private static final String LAST_PORTAL_URL = "last_portal_url";
    private static final String PROD_HOST = "www.seeradetergent.in";
    private static final String PROD_HOST_NO_WWW = "seeradetergent.in";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Explicit Android App Links / deep links always win. Otherwise, after a process restart
        // (notably camera -> WebView on low-memory devices), restore the last portal route.
        if (getIntent() == null || getIntent().getData() == null) {
            restoreLastPortalUrl();
        }
    }

    @Override
    public void onPause() {
        persistCurrentPortalUrl();
        super.onPause();
    }

    private void persistCurrentPortalUrl() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        String url = webView.getUrl();
        if (url == null) return;

        Uri uri = Uri.parse(url);
        String host = uri.getHost();
        String path = uri.getPath();

        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !(PROD_HOST.equalsIgnoreCase(host) || PROD_HOST_NO_WWW.equalsIgnoreCase(host))
                || path == null
                || !path.startsWith("/portal")) {
            return;
        }

        String restored = path + (uri.getQuery() == null ? "" : "?" + uri.getQuery());
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(LAST_PORTAL_URL, restored)
                .apply();
    }

    private void restoreLastPortalUrl() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        final String savedPath = prefs.getString(LAST_PORTAL_URL, null);
        if (savedPath == null || !savedPath.startsWith("/portal")) return;

        // BridgeActivity loads server.url during super.onCreate(). Queueing this on the WebView
        // thread replaces only that generic root load, preserving the exact portal route.
        webView.post(() -> {
            String current = webView.getUrl();
            if (current != null && current.contains(savedPath)) return;
            webView.loadUrl("https://" + PROD_HOST + savedPath);
        });
    }
}
