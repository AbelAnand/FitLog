package com.abelanand.fitlog

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The web app switches "going back by gesture" off while a screen has unsaved changes.
 *
 * On iOS that is the edge swipe of the web view. On Android the equivalent is the system back
 * gesture/button, which the App plugin already hands to JavaScript as a `backButton` event;
 * src/lib/android-back.ts decides what it does and honours this flag. This side only records it,
 * so the call resolves and the state is visible to native code if a widget or shortcut ever needs it.
 */
@CapacitorPlugin(name = "BackGesture")
class BackGesturePlugin : Plugin() {
    @PluginMethod
    fun setEnabled(call: PluginCall) {
        enabled = call.getBoolean("enabled", true) ?: true
        call.resolve()
    }

    companion object {
        @Volatile
        var enabled: Boolean = true
            private set
    }
}
