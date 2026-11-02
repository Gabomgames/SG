package com.somethinggamer.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPermission;
    private static final int FILE_CHOOSER = 101;
    private static final int PERMISSAO_NOTIFICACAO = 202;
    private static final int PERMISSAO_MICROFONE = 203;

    private static final String INICIO = "https://something-gamer.web.app/feed.html";

    /** Só nestes hosts o SG roda de verdade: é onde a ponte JavaScript vale. */
    private static final Set<String> HOSTS_DO_APP = new HashSet<>(Arrays.asList(
        "something-gamer.web.app",
        "something-gamer.firebaseapp.com"
    ));

    /** Hosts que precisam abrir dentro do WebView para o login funcionar, mas sem a ponte. */
    private static final Set<String> HOSTS_DE_LOGIN = new HashSet<>(Arrays.asList(
        "accounts.google.com",
        "steamcommunity.com",
        "us-central1-something-gamer.cloudfunctions.net"
    ));

    private static String hostDe(String url) {
        if (url == null) return "";
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme())) return "";
        String host = uri.getHost();
        return host == null ? "" : host.toLowerCase();
    }

    /** true quando a página aberta agora é o próprio SG. */
    private boolean paginaDoApp() {
        return HOSTS_DO_APP.contains(hostDe(webView.getUrl()));
    }

    private static boolean podeAbrirDentro(String url) {
        String host = hostDe(url);
        return HOSTS_DO_APP.contains(host) || HOSTS_DE_LOGIN.contains(host);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString()
            .replace("; wv", "")
            .replace(" Version/4.0", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new NativeBridge(), "SGAndroidNotifications");
        createNotificationChannel();

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();
                // Antes qualquer https abria aqui dentro, com a ponte SGAndroidNotifications
                // exposta para o site. Agora só o SG e o fluxo de login ficam no app.
                if (podeAbrirDentro(url)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    // Só o SG pede microfone, e só o microfone é concedido.
                    if (!paginaDoApp()) { request.deny(); return; }
                    List<String> pedidos = Arrays.asList(request.getResources());
                    if (!pedidos.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) || pedidos.size() != 1) {
                        request.deny();
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        // guarda o pedido e só libera depois que o Android autorizar
                        pendingWebPermission = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSAO_MICROFONE);
                        return;
                    }
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!paginaDoApp()) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER); return true; }
                catch (Exception error) { fileCallback = null; return false; }
            }
        });

        if (state == null) webView.loadUrl(INICIO); else webView.restoreState(state);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_CHOOSER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (codigo != PERMISSAO_MICROFONE || pendingWebPermission == null) return;
        boolean liberado = resultados.length > 0 && resultados[0] == PackageManager.PERMISSION_GRANTED;
        if (liberado && paginaDoApp()) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else pendingWebPermission.deny();
        pendingWebPermission = null;
    }

    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state); super.onSaveInstanceState(state); }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("sg_messages", "Mensagens do SG", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Mensagens, convites e avisos do Something Gamer");
            channel.enableLights(true); channel.setLightColor(Color.BLUE);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private class NativeBridge {
        @JavascriptInterface public void requestPermission() {
            runOnUiThread(() -> {
                if (!paginaDoApp()) return;
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSAO_NOTIFICACAO);
            });
        }

        @JavascriptInterface public void show(String title, String body, String url, int id) {
            runOnUiThread(() -> {
                // A ponte é visível para a página; se ela não for o SG, não notifica.
                if (!paginaDoApp()) return;
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
                // o destino também precisa ser do SG: a notificação não leva ninguém para fora
                String destino = podeAbrirDentro(url) && HOSTS_DO_APP.contains(hostDe(url)) ? url : INICIO;
                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                intent.setData(Uri.parse(destino));
                intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pending = PendingIntent.getActivity(MainActivity.this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(MainActivity.this, "sg_messages")
                    : new android.app.Notification.Builder(MainActivity.this);
                builder.setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setAutoCancel(true)
                    .setContentIntent(pending);
                getSystemService(NotificationManager.class).notify(id, builder.build());
            });
        }
    }
}
