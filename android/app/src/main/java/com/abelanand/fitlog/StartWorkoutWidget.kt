package com.abelanand.fitlog

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * The Start workout tile: one tap opens the app on the start sheet through `fitlog://start`, the
 * same link the iOS widget uses. MainActivity's VIEW intent filter receives it; Capacitor turns it
 * into the `appUrlOpen` event that src/App.tsx routes to `/?start=1`, on a cold start as well
 * (BridgeActivity.onCreate replays the launch intent through onNewIntent).
 */
class StartWorkoutWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget_start)
        views.setOnClickPendingIntent(R.id.widget_root, startWorkout(context))
        for (id in ids) manager.updateAppWidget(id, views)
    }

    companion object {
        const val START_URL = "fitlog://start"

        fun startWorkout(context: Context): PendingIntent {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(START_URL))
                .setClass(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}
