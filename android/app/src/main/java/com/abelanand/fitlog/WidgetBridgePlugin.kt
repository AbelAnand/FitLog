package com.abelanand.fitlog

import android.content.Context
import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Receives the streak snapshot from the web app (the same `WidgetData` JSON the iOS widget reads)
 * and keeps it in SharedPreferences for a home-screen widget.
 *
 * There is no Android widget yet: this stores the data and is otherwise a working no-op, so the
 * web side can call it exactly as it does on iOS.
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val json = call.data.toString()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
        Log.i("FitLog", "widget data updated (${call.data.length()} keys)")
        call.resolve()
    }

    companion object {
        const val PREFS = "widget"
        const val KEY = "widgetData"
    }
}
