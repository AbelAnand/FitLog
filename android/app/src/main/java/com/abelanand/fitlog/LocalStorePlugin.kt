package com.abelanand.fitlog

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors

/**
 * Keeps the workout log in a SQLite file inside the app.
 *
 * The file lives in the app's private files directory, which Android Auto Backup and
 * device-to-device transfer include (see res/xml/backup_rules.xml). It is never put in the cache
 * or in the no-backup directory.
 *
 * The web side owns the meaning of the data. This side stores records (table, id, JSON) and
 * guarantees that a batch of changes is saved completely or not at all. Same shape as
 * ios/App/App/LocalStorePlugin.swift, so one backup file and one clean.ts serve both.
 */
@CapacitorPlugin(name = "LocalStore")
class LocalStorePlugin : Plugin() {
    private var db: SQLiteDatabase? = null

    /** SQLite is used from one thread at a time, in the order the calls arrived. */
    private val queue = Executors.newSingleThreadExecutor()

    private class StoreError(message: String) : Exception(message)

    private fun file(): File {
        val dir = File(context.filesDir, "FitLog")
        if (!dir.isDirectory && !dir.mkdirs()) throw StoreError("could not create the storage folder")
        return File(dir, "fitlog.sqlite")
    }

    private fun open(): SQLiteDatabase {
        db?.let { if (it.isOpen) return it }
        val opened = SQLiteDatabase.openDatabase(file().path, null, SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY)
        // Write-ahead logging with full sync: a change that was reported as saved survives a crash
        // or a dead battery.
        opened.enableWriteAheadLogging()
        opened.rawQuery("PRAGMA synchronous = FULL", null).close()
        opened.execSQL(
            """
            CREATE TABLE IF NOT EXISTS records (
                tbl  TEXT NOT NULL,
                id   TEXT NOT NULL,
                json TEXT NOT NULL,
                PRIMARY KEY (tbl, id)
            ) WITHOUT ROWID
            """.trimIndent()
        )
        db = opened
        Log.i(TAG, "log opened")
        return opened
    }

    private fun perform(call: PluginCall, work: (SQLiteDatabase) -> JSObject) {
        queue.execute {
            try {
                call.resolve(work(open()))
            } catch (e: Exception) {
                val message = e.message ?: e.javaClass.simpleName
                Log.e(TAG, "storage error: $message")
                call.reject(message)
            }
        }
    }

    @PluginMethod
    fun load(call: PluginCall) {
        perform(call) { db ->
            val rows = JSArray()
            db.rawQuery("SELECT tbl, id, json FROM records", null).use { cursor ->
                while (cursor.moveToNext()) {
                    if (cursor.isNull(0) || cursor.isNull(1) || cursor.isNull(2)) continue
                    rows.put(JSArray().put(cursor.getString(0)).put(cursor.getString(1)).put(cursor.getString(2)))
                }
            }
            JSObject().put("rows", rows)
        }
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val ops = call.getArray("ops")
        if (ops == null) {
            call.reject("write needs a list of changes")
            return
        }
        perform(call) { db ->
            // beginTransactionNonExclusive is BEGIN IMMEDIATE in WAL mode: readers carry on, writers wait.
            db.beginTransactionNonExclusive()
            try {
                db.compileStatement("INSERT OR REPLACE INTO records (tbl, id, json) VALUES (?, ?, ?)").use { put ->
                    db.compileStatement("DELETE FROM records WHERE tbl = ? AND id = ?").use { remove ->
                        for (i in 0 until ops.length()) {
                            val op = ops.getJSONObject(i)
                            val table = op.optString("t")
                            val id = op.optString("id")
                            if (table.isEmpty() || id.isEmpty()) throw StoreError("a change is missing its table or id")
                            if (op.has("j") && !op.isNull("j")) {
                                put.clearBindings()
                                put.bindString(1, table)
                                put.bindString(2, id)
                                put.bindString(3, op.getString("j"))
                                put.executeInsert()
                            } else {
                                remove.clearBindings()
                                remove.bindString(1, table)
                                remove.bindString(2, id)
                                remove.executeUpdateDelete()
                            }
                        }
                    }
                }
                db.setTransactionSuccessful()
            } finally {
                // Without setTransactionSuccessful this rolls the whole batch back.
                db.endTransaction()
            }
            JSObject()
        }
    }

    @PluginMethod
    fun wipe(call: PluginCall) {
        perform(call) { db ->
            db.execSQL("DELETE FROM records")
            // Return the freed pages to the file system so nothing erased lingers in the file.
            db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).close()
            db.execSQL("VACUUM")
            JSObject()
        }
    }

    companion object {
        private const val TAG = "FitLog"
    }
}
