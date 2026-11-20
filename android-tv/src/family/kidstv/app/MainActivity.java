package family.kidstv.app;

import android.app.Activity;
import android.content.Context;
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
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Kids TV for Android TV / Google TV.
 * A thin shell: shows the Kids TV web page full screen, forwards the remote's
 * buttons to it, and refuses to open any other website.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://olddognewtools.github.io/Kids-Channel/";
    private static final String HOST = "olddognewtools.github.io";
    private static final String PATH = "/Kids-Channel/";
    private static final int BG = 0xFF1B2340;

    // Loads the remote-control layer (tv.js) that sits next to the page.
    private static final String LOADER =
        "(function(){if(window.__kidsTvKey||window.__kidsTvLoading)return;window.__kidsTvLoading=1;"
        + "var s=document.createElement('script');s.src='tv.js';"
        + "s.onerror=function(){window.__kidsTvLoading=0;};document.head.appendChild(s);})()";

    private WebView web;
    private TextView message;
    private boolean failed;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // keeps the saved list (kidsTV.v1)
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        web.setWebViewClient(new Client());
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        message = new TextView(this);
        message.setTextColor(0xFFFFFFFF);
        message.setTextSize(26);
        message.setGravity(Gravity.CENTER);
        message.setBackgroundColor(BG);
        message.setText("Kids TV can't connect to the internet.\n\nPress OK on the remote to try again.");
        message.setVisibility(View.GONE);
        root.addView(message, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
        web.requestFocus();
        web.loadUrl(HOME);
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
                view.evaluateJavascript(LOADER, null);
            }
        }

        @Override
        public void onReceivedError(WebView view, int code, String description, String failingUrl) {
            failed = true;
            message.setVisibility(View.VISIBLE);
            view.loadUrl("about:blank");
        }
    }

    private void retry() {
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
        if (e.getAction() == KeyEvent.ACTION_DOWN && (e.getRepeatCount() == 0 || isArrow(k))) {
            press(k, e.getKeyCode());
        }
        return true;
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
                        web.evaluateJavascript(LOADER, null);
                        if (isArrow(k) || "ok".equals(k)) {
                            web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
                            web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
                        }
                    }
                }
            });
    }

    /** Taps the text box at the given page position so the on-screen keyboard opens. */
    private void openKeyboard(String v) {
        try {
            String[] p = v.replace("\"", "").substring(v.replace("\"", "").indexOf("ime:") + 4).split(",");
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
        // Leaving the app (Home button, TV switched off): stop the sound.
        web.evaluateJavascript("window.__kidsTvKey&&window.__kidsTvKey('pause')", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.requestFocus();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
