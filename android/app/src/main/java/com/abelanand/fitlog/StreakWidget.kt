package com.abelanand.fitlog

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar

/**
 * The Streak home-screen widget: the flame, the week streak, and this week's seven days with the
 * trained ones lit. The same data and layout as the small iOS widget (ios/App/FitLogWidget).
 *
 * The data is the `widgetData` JSON the web app hands to WidgetBridgePlugin (src/lib/widget.ts):
 * `{ streak, thisWeek, goal, week: [Mon..Sun 0|1], todayIndex, lastTitle, lastDate, updatedAt }`.
 * The app refreshes the widget on every update; the launcher also asks every hour (so the "today"
 * ring moves past midnight) and whenever a widget is placed or resized.
 */
class StreakWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = build(context)
        for (id in ids) manager.updateAppWidget(id, views)
    }

    /** One snapshot of the data, already checked, so a damaged preference cannot break the widget. */
    class Data(val streak: Int, val thisWeek: Int, val goal: Int, val week: IntArray, val todayIndex: Int, val updatedAt: Long) {
        companion object {
            fun parse(text: String?): Data? {
                if (text.isNullOrEmpty()) return null
                return try {
                    val o = JSONObject(text)
                    val weekJson = o.optJSONArray("week")
                    val week = IntArray(7) { i -> if (weekJson != null && i < weekJson.length() && weekJson.optInt(i) == 1) 1 else 0 }
                    Data(
                        streak = o.optInt("streak").coerceIn(0, 9999),
                        thisWeek = o.optInt("thisWeek").coerceIn(0, 7),
                        goal = o.optInt("goal", 4).coerceIn(1, 7),
                        week = week,
                        todayIndex = o.optInt("todayIndex", -1).coerceIn(-1, 6),
                        updatedAt = o.optLong("updatedAt", 0L),
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "widget data unreadable: ${e.message}")
                    null
                }
            }
        }
    }

    companion object {
        private const val TAG = "FitLog"
        private val DOTS = intArrayOf(R.id.dot_0, R.id.dot_1, R.id.dot_2, R.id.dot_3, R.id.dot_4, R.id.dot_5, R.id.dot_6)
        private val DAYS = intArrayOf(R.id.day_0, R.id.day_1, R.id.day_2, R.id.day_3, R.id.day_4, R.id.day_5, R.id.day_6)

        /** Redraw every placed Streak widget. Called by WidgetBridgePlugin after the app saves new data. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, StreakWidget::class.java))
            if (ids.isEmpty()) return
            manager.updateAppWidget(ids, build(context))
        }

        fun load(context: Context): Data? =
            Data.parse(context.getSharedPreferences(WidgetBridgePlugin.PREFS, Context.MODE_PRIVATE).getString(WidgetBridgePlugin.KEY, null))

        fun build(context: Context): RemoteViews {
            val data = load(context)
            val views = if (data == null) {
                RemoteViews(context.packageName, R.layout.widget_streak_empty)
            } else {
                RemoteViews(context.packageName, R.layout.widget_streak).also { fill(context, it, data) }
            }
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context))
            return views
        }

        private fun fill(context: Context, views: RemoteViews, data: Data) {
            // The stored "today" is right on the day the app last ran. On later days the device clock
            // wins, and once a new week has started the dots belong to last week, so they go dark.
            val sameWeek = startOfWeek(data.updatedAt) == startOfWeek(System.currentTimeMillis())
            val today = todayIndex()
            val week = if (sameWeek) data.week else IntArray(7)
            val thisWeek = if (sameWeek) data.thisWeek else 0

            views.setTextViewText(R.id.streak_count, data.streak.toString())
            views.setTextViewText(R.id.streak_unit, context.getString(if (data.streak == 1) R.string.widget_week_singular else R.string.widget_week_plural))
            views.setTextViewText(R.id.this_week_count, thisWeek.toString())
            views.setTextViewText(R.id.this_week_goal, context.getString(R.string.widget_this_week, data.goal))
            for (i in 0 until 7) {
                val trained = week[i] == 1
                val isToday = i == today
                val dot = when {
                    trained -> R.drawable.widget_dot_on
                    isToday -> R.drawable.widget_dot_today
                    else -> R.drawable.widget_dot_off
                }
                views.setImageViewResource(DOTS[i], dot)
                views.setTextColor(DAYS[i], context.getColor(if (isToday) R.color.widgetText else R.color.widgetFaint))
            }
            views.setContentDescription(R.id.widget_root, context.getString(R.string.widget_streak_a11y, data.streak, thisWeek, data.goal))
        }

        /** Tapping the widget opens the app where it was left (the launcher intent). */
        private fun openApp(context: Context): PendingIntent {
            val intent = Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setClass(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        /** 0 = Monday … 6 = Sunday, like the `week` array. */
        private fun todayIndex(): Int = dayIndex(Calendar.getInstance())

        private fun dayIndex(c: Calendar): Int = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7

        /** Midnight at the start of the Monday-based week holding `millis`, in the device's time zone. */
        private fun startOfWeek(millis: Long): Long {
            val c = Calendar.getInstance()
            c.timeInMillis = millis
            c.add(Calendar.DAY_OF_YEAR, -dayIndex(c))
            c.set(Calendar.HOUR_OF_DAY, 0)
            c.set(Calendar.MINUTE, 0)
            c.set(Calendar.SECOND, 0)
            c.set(Calendar.MILLISECOND, 0)
            return c.timeInMillis
        }
    }
}
