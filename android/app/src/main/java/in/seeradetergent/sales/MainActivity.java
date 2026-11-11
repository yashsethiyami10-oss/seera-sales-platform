package in.seeradetergent.sales;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;

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
    private static final int LOCATION_PERMISSION_REQUEST = 4101;
    private AlertDialog gpsDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Explicit Android App Links / deep links always win. Otherwise, after a process restart
        // (notably camera -> WebView on low-memory devices), restore the last portal route.
        if (getIntent() == null || getIntent().getData() == null) {
            restoreLastPortalUrl();
        }
        installDownloadHandler();
        requestLocationPermissionIfNeeded();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Every time the app comes to the front: if phone location (GPS) is switched off, ask the
        // rep to turn it on right away — TA distance and visit check-ins depend on it.
        promptToEnableGpsIfOff();
    }

    private void requestLocationPermissionIfNeeded() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {
                Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION
            }, LOCATION_PERMISSION_REQUEST);
        }
    }

    private void promptToEnableGpsIfOff() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null || LocationManagerCompat.isLocationEnabled(lm)) {
            if (gpsDialog != null && gpsDialog.isShowing()) gpsDialog.dismiss();
            return;
        }
        if (gpsDialog != null && gpsDialog.isShowing()) return;
        gpsDialog = new AlertDialog.Builder(this)
            .setTitle("GPS चालू करें / Turn on GPS")
            .setMessage("Seera App को आपकी लोकेशन चाहिए — विज़िट, चेक-इन और TA (यात्रा भत्ता) इसी से गिना जाता है।\n\nSeera needs your location for visits, check-ins and TA distance.")
            .setCancelable(false)
            .setPositiveButton("GPS चालू करें / Turn on", (d, w) -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
            .setNegativeButton("बाद में / Later", (d, w) -> d.dismiss())
            .show();
    }

    /**
     * Android WebView does not save files by itself, so PDF downloads (Company documents, salary
     * slips, invoices) silently did nothing in the app. Hand them to Android's DownloadManager with
     * the signed-in session cookie — only for the Seera production origin — so they land in
     * Downloads with a "download complete" notification.
     */
    private void installDownloadHandler() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                Uri uri = Uri.parse(url);
                String host = uri.getHost();
                if (!"https".equalsIgnoreCase(uri.getScheme())
                        || !(PROD_HOST.equalsIgnoreCase(host) || PROD_HOST_NO_WWW.equalsIgnoreCase(host))) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return;
                }
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(uri);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.addRequestHeader("User-Agent", userAgent);
                request.setMimeType(mimeType);
                request.setTitle(fileName);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                try {
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                } catch (IllegalStateException e) {
                    request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
                }
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(request);
                Toast.makeText(this, "डाउनलोड हो रहा है / Downloading: " + fileName, Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "डाउनलोड नहीं हुआ / Download failed", Toast.LENGTH_LONG).show();
            }
        });
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
