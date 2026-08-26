package com.jorgepnt.coroapdf;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://coroapdf.vercel.app";
    private static final int FILE_CHOOSER_REQUEST = 8104;
    private static final int MAX_INCOMING_PDF_BYTES = 25 * 1024 * 1024;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final AndroidBridge androidBridge = new AndroidBridge();

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " CoroaPDFAndroid/1.1");

        webView.addJavascriptInterface(androidBridge, "CoroaPDFAndroid");
        webView.setWebViewClient(new CoroaWebViewClient());
        webView.setWebChromeClient(new CoroaWebChromeClient());

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            openIntent(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIntent(intent);
    }

    private void openIntent(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (Intent.ACTION_VIEW.equals(intent == null ? null : intent.getAction()) && uri != null) {
            loadIncomingPdf(uri);
        } else {
            webView.loadUrl(APP_ORIGIN);
        }
    }

    private void loadIncomingPdf(Uri uri) {
        new Thread(() -> {
            try (InputStream input = getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalArgumentException("Datei nicht lesbar");
                byte[] buffer = new byte[16 * 1024];
                int total = 0;
                int count;
                while ((count = input.read(buffer)) >= 0) {
                    total += count;
                    if (total > MAX_INCOMING_PDF_BYTES) {
                        throw new IllegalArgumentException("PDF ist größer als 25 MB");
                    }
                    output.write(buffer, 0, count);
                }
                androidBridge.incomingPdfBase64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                String segment = uri.getLastPathSegment();
                androidBridge.incomingPdfName = segment != null && segment.toLowerCase(Locale.ROOT).endsWith(".pdf")
                    ? segment.substring(segment.lastIndexOf('/') + 1)
                    : "dokument.pdf";
                runOnUiThread(() -> webView.loadUrl(APP_ORIGIN + "/tools/lesen?quelle=android"));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    Toast.makeText(this, "PDF konnte nicht geöffnet werden: " + error.getMessage(), Toast.LENGTH_LONG).show();
                    webView.loadUrl(APP_ORIGIN + "/tools/lesen");
                });
            }
        }).start();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    private final class CoroaWebViewClient extends WebViewClient {
        private boolean openUri(WebView view, Uri uri) {
            if (uri == null) return true;

            String host = uri.getHost();
            String scheme = uri.getScheme();
            if ("coroapdf.vercel.app".equalsIgnoreCase(host) && "https".equalsIgnoreCase(scheme)) {
                // Load internal links explicitly in the existing WebView. This
                // avoids Android handing the navigation back to the launcher or
                // restoring the homepage activity.
                view.loadUrl(uri.toString());
                return true;
            }

            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception error) {
                Toast.makeText(MainActivity.this, "Link konnte nicht geöffnet werden.", Toast.LENGTH_LONG).show();
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            return openUri(view, request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openUri(view, Uri.parse(url));
        }
    }

    private final class CoroaWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView view,
            ValueCallback<Uri[]> callback,
            FileChooserParams params
        ) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception error) {
                fileChooserCallback = null;
                Toast.makeText(MainActivity.this, "Dateiauswahl ist nicht verfügbar.", Toast.LENGTH_LONG).show();
                return false;
            }
        }
    }

    public final class AndroidBridge {
        private volatile String incomingPdfBase64 = "";
        private volatile String incomingPdfName = "";

        @JavascriptInterface
        public String consumeIncomingPdfBase64() {
            return incomingPdfBase64;
        }

        @JavascriptInterface
        public String getIncomingPdfName() {
            return incomingPdfName;
        }

        @JavascriptInterface
        public void clearIncomingPdf() {
            incomingPdfBase64 = "";
            incomingPdfName = "";
        }

        @JavascriptInterface
        public void saveBase64File(String encoded, String filename, String mime) {
            new Thread(() -> {
                try {
                    byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/CoroaPDF");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Download konnte nicht angelegt werden");
                    try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                        if (output == null) throw new IllegalStateException("Download konnte nicht geschrieben werden");
                        output.write(bytes);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, values, null, null);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Gespeichert unter Downloads/CoroaPDF", Toast.LENGTH_LONG).show());
                } catch (Exception error) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Speichern fehlgeschlagen: " + error.getMessage(), Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }
}
