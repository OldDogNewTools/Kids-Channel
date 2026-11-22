package family.kidstv.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Kids TV for Android TV / Google TV and for touch tablets (including Fire tablets).
 * A thin shell: shows the Kids TV web page full screen and refuses to open any
 * other website.
 *  - On a TV it forwards the remote's buttons to the page (tv.js).
 *  - On a tablet it loads the daily time limit / lock screen (tablet.js) and can
 *    pin itself to the screen when a grown-up asks for that in the settings.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://olddognewtools.github.io/Kids-Channel/";
    private static final String HOST = "olddognewtools.github.io";
    private static final String PATH = "/Kids-Channel/";
    private static final int BG = 0xFF1B2340;
    private static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;

    private FrameLayout root;
    private WebView web;
    private TextView message;
    private boolean failed;
    private boolean tv;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        tv = isTv();

        root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // keeps the saved list (kidsTV.v1) and the timer
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        root.addView(web, new FrameLayout.LayoutParams(MATCH, MATCH));

        message = new TextView(this);
        message.setTextColor(0xFFFFFFFF);
        message.setTextSize(26);
        message.setGravity(Gravity.CENTER);
        message.setBackgroundColor(BG);
        message.setText(tv
            ? "Kids TV can't connect to the internet.\n\nPress OK on the remote to try again."
            : "Kids TV can't connect to the internet.\n\nTap here to try again.");
        message.setVisibility(View.GONE);
        message.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { retry(); }
        });
        root.addView(message, new FrameLayout.LayoutParams(MATCH, MATCH));

        setContentView(root);
        immersive();
        web.requestFocus();
        web.loadUrl(HOME);
    }

    private boolean isTv() {
        try {
            UiModeManager um = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
            if (um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
            PackageManager pm = getPackageManager();
            return pm.hasSystemFeature("android.software.leanback")
                || !pm.hasSystemFeature("android.hardware.touchscreen");
        } catch (Exception e) {
            return false;
        }
    }

    /** Tablets: hide the system bars so only Kids TV shows. */
    private void immersive() {
        if (tv) return;
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    /** Loads the helper that sits next to the page: tv.js on a TV, tablet.js on a tablet. */
    private String loader() {
        String mode = tv ? "tv" : "tablet";
        return "(function(){if(window.__kidsLoading)return;window.__kidsLoading=1;"
            + "window.__kidsShell='" + mode + "';"
            + "var s=document.createElement('script');s.src='" + mode + ".js';"
            + "s.onerror=function(){window.__kidsLoading=0;};document.head.appendChild(s);})()";
    }

    private static boolean allowed(String url) {
        try {
            Uri u = Uri.parse(url);
            return "https".equals(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(PATH);
        } catch (Exception e) {
            return false;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            // Only the Kids TV page may fill the screen. Links that try to leave
            // (for example the YouTube logo inside a video) are ignored.
            return !allowed(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!failed && url != null && url.startsWith(HOME)) {
                view.evaluateJavascript(loader(), null);
            }
        }

        @Override
        public void onReceivedError(WebView view, int code, String description, String failingUrl) {
            failed = true;
            message.setVisibility(View.VISIBLE);
            view.loadUrl("about:blank");
        }
    }

    private class Chrome extends WebChromeClient {
        // The page talks to this shell by calling prompt("kidstv:<command>").
        // Only the Kids TV page itself is listened to; no dialog is ever shown.
        @Override
        public boolean onJsPrompt(WebView view, String url, String msg, String def, JsPromptResult result) {
            if (msg != null && msg.startsWith("kidstv:") && allowed(url)) {
                result.confirm(bridge(msg.substring(7)));
            } else {
                result.cancel();
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String msg, JsResult result) {
            result.cancel();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String msg, JsResult result) {
            result.cancel();
            return true;
        }

        // Full-screen button inside a video.
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) { callback.onCustomViewHidden(); return; }
            customView = view;
            customCallback = callback;
            root.addView(view, new FrameLayout.LayoutParams(MATCH, MATCH));
            web.setVisibility(View.GONE);
            immersive();
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            web.setVisibility(View.VISIBLE);
            if (customCallback != null) customCallback.onCustomViewHidden();
            customCallback = null;
            web.requestFocus();
            immersive();
        }
    }

    private boolean leaveFullScreen() {
        if (customView == null) return false;
        WebChromeClient.CustomViewCallback cb = customCallback;
        root.removeView(customView);
        customView = null;
        customCallback = null;
        web.setVisibility(View.VISIBLE);
        if (cb != null) cb.onCustomViewHidden();
        web.requestFocus();
        immersive();
        return true;
    }

    private boolean pinned() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        } catch (Exception e) {
            return false;
        }
    }

    private String bridge(String cmd) {
        if ("pin".equals(cmd)) {
            web.post(new Runnable() {
                @Override
                public void run() { try { if (!pinned()) startLockTask(); } catch (Exception ignored) { } }
            });
            return "asked";
        }
        if ("unpin".equals(cmd)) {
            web.post(new Runnable() {
                @Override
                public void run() { try { if (pinned()) stopLockTask(); } catch (Exception ignored) { } }
            });
            return "asked";
        }
        if ("pinstate".equals(cmd)) return pinned() ? "pinned" : "off";
        if ("mode".equals(cmd)) return tv ? "tv" : "tablet";
        return "";
    }

    private void retry() {
        if (!failed) return;
        failed = false;
        message.setVisibility(View.GONE);
        web.loadUrl(HOME);
        web.requestFocus();
    }

    private static String keyName(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A: return "ok";
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_BUTTON_B: return "back";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "playpause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP: return "pause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "ff";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "rw";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "prev";
            default: return null;
        }
    }

    private static boolean isArrow(String k) {
        return "up".equals(k) || "down".equals(k) || "left".equals(k) || "right".equals(k);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // Keys typed on the on-screen keyboard go straight to the text box.
        if ((e.getFlags() & KeyEvent.FLAG_SOFT_KEYBOARD) != 0) return super.dispatchKeyEvent(e);
        String k = keyName(e.getKeyCode());
        if (k == null) return super.dispatchKeyEvent(e);
        if (!tv) {
            // Tablet: only the Back button is ours; a keyboard's other keys behave normally.
            if (!"back".equals(k)) return super.dispatchKeyEvent(e);
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) tabletBack();
            return true;
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN && (e.getRepeatCount() == 0 || isArrow(k))) {
            press(k, e.getKeyCode());
        }
        return true;
    }

    /** Tablet Back button: closes the video or the open panel; on the home screen it does nothing. */
    private void tabletBack() {
        if (leaveFullScreen()) return;
        if (failed) { if (!pinned()) finish(); return; }
        web.evaluateJavascript(
            "window.__kidsBack?window.__kidsBack():'none'",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String v) {
                    // "none": the page isn't ready, so don't trap the user in a blank app.
                    if ((v == null || v.contains("none") || v.equals("null")) && !pinned()) finish();
                }
            });
    }

    private void press(final String k, final int code) {
        if (failed) {
            if ("ok".equals(k)) retry();
            else if ("back".equals(k)) finish();
            return;
        }
        web.evaluateJavascript(
            "window.__kidsTvKey?window.__kidsTvKey('" + k + "'):'none'",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String v) {
                    if (v == null) v = "none";
                    if (v.contains("ime:")) {
                        openKeyboard(v);
                    } else if (v.contains("exit")) {
                        finish();
                    } else if (v.contains("none") || v.equals("null")) {
                        // The remote layer isn't loaded (yet). Back leaves the app;
                        // other keys fall back to the built-in page navigation.
                        if ("back".equals(k)) { finish(); return; }
                        web.evaluateJavascript(loader(), null);
                        if (isArrow(k) || "ok".equals(k)) {
                            web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
                            web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
                        }
                    }
                }
            });
    }

    /** Taps the text box at the given page position so the on-screen keyboard opens (TV). */
    private void openKeyboard(String v) {
        try {
            String clean = v.replace("\"", "");
            String[] p = clean.substring(clean.indexOf("ime:") + 4).split(",");
            float density = getResources().getDisplayMetrics().density;
            float x = Float.parseFloat(p[0].trim()) * density;
            float y = Float.parseFloat(p[1].trim()) * density;
            long t = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0);
            MotionEvent up = MotionEvent.obtain(t, t + 40, MotionEvent.ACTION_UP, x, y, 0);
            down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            web.dispatchTouchEvent(down);
            web.dispatchTouchEvent(up);
            down.recycle();
            up.recycle();
        } catch (Exception ignored) { }
        web.requestFocus();
        web.postDelayed(new Runnable() {
            @Override
            public void run() {
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 300);
    }

    @Override
    protected void onPause() {
        // Leaving the app (Home button, screen off): stop the sound and save the timer.
        web.evaluateJavascript(
            "window.__kidsTvKey?window.__kidsTvKey('pause'):(window.__kidsPause&&window.__kidsPause())", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.requestFocus();
        immersive();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
