package com.abelanand.fitlog

import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.BridgeActivity

/** Registers the plugins that live inside the app (not in a package); the rest come from capacitor.plugins.json. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(LocalStorePlugin::class.java)
        registerPlugin(WidgetBridgePlugin::class.java)
        registerPlugin(BackGesturePlugin::class.java)
        super.onCreate(savedInstanceState)
        Log.i("FitLog", "in-app plugins registered")
        runTestHooks()
    }

    /**
     * Test hooks, honoured by debuggable builds only (the iOS project has the same pair):
     *   adb shell am start -n com.abelanand.fitlog/.MainActivity --es FITLOG_ROUTE /progress
     *   adb shell am start -n com.abelanand.fitlog/.MainActivity --es FITLOG_JS 'window.scrollTo(0,600)'
     * The route opens a screen directly; the snippet runs a few seconds later.
     */
    private fun runTestHooks() {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0) return
        val handler = Handler(Looper.getMainLooper())
        intent.getStringExtra("FITLOG_ROUTE")?.takeIf { it.startsWith("/") }?.let { route ->
            handler.postDelayed({
                bridge?.webView?.evaluateJavascript("history.pushState({}, '', '$route'); dispatchEvent(new PopStateEvent('popstate'));", null)
            }, 4000)
        }
        intent.getStringExtra("FITLOG_JS")?.takeIf { it.isNotEmpty() }?.let { snippet ->
            handler.postDelayed({ bridge?.webView?.evaluateJavascript(snippet, null) }, 9000)
        }
    }
}
