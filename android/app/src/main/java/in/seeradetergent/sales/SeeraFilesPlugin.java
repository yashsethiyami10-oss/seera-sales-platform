package in.seeradetergent.sales;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Files for the Seera web portal running inside this shell.
 *
 * A WebView cannot save a file by itself: links opened with target="_blank" and blob: downloads
 * (client-side CSV exports) silently did nothing, and the Web Share API does not exist in Android
 * WebView. The page fetches the file itself (with its own signed-in session), passes the bytes
 * here, and this plugin:
 *   save  — writes it to Downloads/Seera (MediaStore on Android 10+, no storage permission needed)
 *           and opens it in the phone's viewer so the user sees it arrived;
 *   share — hands it straight to WhatsApp (or WhatsApp Business) with the file attached, falling
 *           back to the normal Android share sheet when neither is installed or target is "any".
 */
@CapacitorPlugin(name = "SeeraFiles")
public class SeeraFilesPlugin extends Plugin {
    private static final String[] WHATSAPP_PACKAGES = { "com.whatsapp", "com.whatsapp.w4b" };

    private static String safeName(String raw) {
        String name = raw == null ? "" : raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-").trim();
        if (name.isEmpty()) name = "Seera-file";
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    private static byte[] decode(PluginCall call) {
        String data = call.getString("base64");
        if (data == null || data.isEmpty()) return null;
        return Base64.decode(data, Base64.DEFAULT);
    }

    private Uri writeShareCopy(String name, byte[] bytes) throws IOException {
        File dir = new File(getContext().getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create share folder");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    @PluginMethod
    public void save(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) {
            call.reject("No file data");
            return;
        }
        String name = safeName(call.getString("fileName"));
        String mime = call.getString("mimeType", "application/octet-stream");
        boolean open = Boolean.TRUE.equals(call.getBoolean("open", true));
        try {
            Uri uri;
            String location;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Seera");
                ContentResolver resolver = getContext().getContentResolver();
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("Could not create the file in Downloads");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("Could not open the file in Downloads");
                    out.write(bytes);
                }
                location = "Downloads/Seera";
            } else {
                // Android 9 and older: the app's own Downloads folder needs no storage permission.
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Seera");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create Downloads folder");
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                location = "Seera app Downloads";
            }
            final String toast = "सेव हुआ / Saved: " + location + "/" + name;
            getActivity().runOnUiThread(() -> Toast.makeText(getContext(), toast, Toast.LENGTH_LONG).show());
            boolean opened = false;
            if (open) {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(uri, mime);
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getActivity().startActivity(view);
                    opened = true;
                } catch (ActivityNotFoundException ignored) {
                    // No viewer for this type (e.g. CSV): the file is still saved.
                }
            }
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            ret.put("location", location);
            ret.put("fileName", name);
            ret.put("opened", opened);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) {
            call.reject("No file data");
            return;
        }
        String name = safeName(call.getString("fileName"));
        String mime = call.getString("mimeType", "application/octet-stream");
        String text = call.getString("text");
        String target = call.getString("target", "any");
        try {
            Uri uri = writeShareCopy(name, bytes);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if ("whatsapp".equals(target)) {
                for (String pkg : WHATSAPP_PACKAGES) {
                    Intent direct = new Intent(send);
                    direct.setPackage(pkg);
                    try {
                        getActivity().startActivity(direct);
                        JSObject ret = new JSObject();
                        ret.put("app", pkg);
                        call.resolve(ret);
                        return;
                    } catch (ActivityNotFoundException ignored) {
                        // Not installed — try the next one, then the share sheet.
                    }
                }
            }
            Intent chooser = Intent.createChooser(send, "Share / भेजें");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject ret = new JSObject();
            ret.put("app", "chooser");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not share the file: " + e.getMessage());
        }
    }
}
