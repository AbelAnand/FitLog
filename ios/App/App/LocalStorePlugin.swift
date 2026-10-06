import Foundation
import Capacitor
import SQLite3

/// Keeps the workout log in a SQLite file inside the app.
///
/// The file lives in Application Support, which iOS includes in iCloud and computer backups and
/// carries across when setting up a new iPhone. It is never excluded from backup.
///
/// The web side owns the meaning of the data. This side stores records (table, id, JSON) and
/// guarantees that a batch of changes is saved completely or not at all.
@objc(LocalStorePlugin)
public class LocalStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalStorePlugin"
    public let jsName = "LocalStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wipe", returnType: CAPPluginReturnPromise)
    ]

    private var db: OpaquePointer?
    /// SQLite is used from one thread at a time.
    private let queue = DispatchQueue(label: "com.abelanand.fitlog.localstore")
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private struct StoreError: Error { let message: String }

    static func fileURL() throws -> URL {
        let dir = try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("FitLog", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("fitlog.sqlite")
    }

    private func lastError() -> StoreError {
        StoreError(message: db.map { String(cString: sqlite3_errmsg($0)) } ?? "database is not open")
    }

    private func run(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw lastError() }
    }

    private func open() throws {
        if db != nil { return }
        let url = try Self.fileURL()
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &handle, flags, nil) == SQLITE_OK, let opened = handle else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "could not open the database"
            sqlite3_close(handle)
            throw StoreError(message: message)
        }
        db = opened
        sqlite3_busy_timeout(opened, 3000)
        // Write-ahead logging with full sync: a change that was reported as saved survives a crash
        // or a dead battery.
        try run("PRAGMA journal_mode = WAL;")
        try run("PRAGMA synchronous = FULL;")
        try run("""
            CREATE TABLE IF NOT EXISTS records (
                tbl  TEXT NOT NULL,
                id   TEXT NOT NULL,
                json TEXT NOT NULL,
                PRIMARY KEY (tbl, id)
            ) WITHOUT ROWID;
            """)
        NSLog("FitLog: log opened")
    }

    private func perform(_ call: CAPPluginCall, _ work: @escaping () throws -> [String: Any]) {
        queue.async {
            do {
                try self.open()
                call.resolve(try work())
            } catch let error as StoreError {
                NSLog("FitLog: storage error: %@", error.message)
                call.reject(error.message)
            } catch {
                NSLog("FitLog: storage error: %@", error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func load(_ call: CAPPluginCall) {
        perform(call) {
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(self.db, "SELECT tbl, id, json FROM records", -1, &statement, nil) == SQLITE_OK else { throw self.lastError() }
            defer { sqlite3_finalize(statement) }
            var rows: [[String]] = []
            while true {
                let step = sqlite3_step(statement)
                if step == SQLITE_DONE { break }
                guard step == SQLITE_ROW else { throw self.lastError() }
                guard let t = sqlite3_column_text(statement, 0), let i = sqlite3_column_text(statement, 1), let j = sqlite3_column_text(statement, 2) else { continue }
                rows.append([String(cString: t), String(cString: i), String(cString: j)])
            }
            return ["rows": rows]
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let ops = call.getArray("ops") as? [[String: Any]] else {
            call.reject("write needs a list of changes")
            return
        }
        perform(call) {
            try self.run("BEGIN IMMEDIATE;")
            do {
                var put: OpaquePointer?
                var remove: OpaquePointer?
                guard sqlite3_prepare_v2(self.db, "INSERT OR REPLACE INTO records (tbl, id, json) VALUES (?, ?, ?)", -1, &put, nil) == SQLITE_OK else { throw self.lastError() }
                defer { sqlite3_finalize(put) }
                guard sqlite3_prepare_v2(self.db, "DELETE FROM records WHERE tbl = ? AND id = ?", -1, &remove, nil) == SQLITE_OK else { throw self.lastError() }
                defer { sqlite3_finalize(remove) }

                for op in ops {
                    guard let table = op["t"] as? String, let id = op["id"] as? String, !table.isEmpty, !id.isEmpty else {
                        throw StoreError(message: "a change is missing its table or id")
                    }
                    let statement = (op["j"] as? String) != nil ? put : remove
                    sqlite3_reset(statement)
                    sqlite3_clear_bindings(statement)
                    sqlite3_bind_text(statement, 1, table, -1, self.transient)
                    sqlite3_bind_text(statement, 2, id, -1, self.transient)
                    if let json = op["j"] as? String {
                        sqlite3_bind_text(statement, 3, json, -1, self.transient)
                    }
                    guard sqlite3_step(statement) == SQLITE_DONE else { throw self.lastError() }
                }
                try self.run("COMMIT;")
            } catch {
                try? self.run("ROLLBACK;")
                throw error
            }
            return [:]
        }
    }

    @objc func wipe(_ call: CAPPluginCall) {
        perform(call) {
            try self.run("DELETE FROM records;")
            // Return the freed pages to the file system so nothing erased lingers in the file.
            try self.run("PRAGMA wal_checkpoint(TRUNCATE);")
            try self.run("VACUUM;")
            return [:]
        }
    }
}
