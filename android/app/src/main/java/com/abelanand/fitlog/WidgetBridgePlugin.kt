package com.abelanand.fitlog

import android.content.Context
import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Receives the streak snapshot from the web app (the same `WidgetData` JSON the iOS widget reads),
 * keeps it in SharedPreferences, and redraws the Streak home-screen widget (StreakWidget.kt).
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val json = call.data.toString()
        // commit, not apply: the widget is redrawn right after this and must read the new value.
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).commit()
        Log.i("FitLog", "widget data updated (${call.data.length()} keys)")
        try {
            StreakWidget.refresh(context)
        } catch (e: Exception) {
            // A launcher problem must not fail the app's own call.
            Log.w("FitLog", "widget refresh failed: ${e.message}")
        }
        call.resolve()
    }

    companion object {
        const val PREFS = "widget"
        const val KEY = "widgetData"
    }
}
