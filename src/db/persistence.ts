import { registerPlugin } from '@capacitor/core'
import { isNative } from '../lib/native'
import { TABLES, type Op, type Persistence, type StoredRecord, type Table } from './types'

const isTable = (t: unknown): t is Table => typeof t === 'string' && (TABLES as string[]).includes(t)

/* ---------- iPhone: a SQLite file inside the app, written by LocalStorePlugin.swift ---------- */

interface LocalStorePlugin {
  load(): Promise<{ rows: [string, string, string][] }>
  write(options: { ops: { t: string; id: string; j?: string }[] }): Promise<void>
  wipe(): Promise<void>
}

const LocalStore = registerPlugin<LocalStorePlugin>('LocalStore')

export const nativePersistence: Persistence = {
  async load() {
    const { rows } = await LocalStore.load()
    const out: StoredRecord[] = []
    for (const [t, id, json] of rows) {
      if (!isTable(t)) continue
      try {
        out.push({ t, id, v: JSON.parse(json) })
      } catch {
        // One unreadable record must not take the rest of the log down with it.
      }
    }
    return out
  },
  write: (ops) => LocalStore.write({ ops: ops.map((op) => (op.v == null ? { t: op.t, id: op.id } : { t: op.t, id: op.id, j: JSON.stringify(op.v) })) }),
  wipe: () => LocalStore.wipe(),
}

/* ---------- Browser: used for development only ---------- */

const KEY = 'fitlog.localdb.v1'

export const browserPersistence: Persistence = {
  async load() {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
      return Object.entries(all).flatMap(([key, v]) => {
        const [t, id] = key.split('/', 2)
        return isTable(t) && id ? [{ t, id, v }] : []
      })
    } catch {
      return []
    }
  },
  async write(ops: Op[]) {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    for (const op of ops) {
      if (op.v == null) delete all[`${op.t}/${op.id}`]
      else all[`${op.t}/${op.id}`] = op.v
    }
    localStorage.setItem(KEY, JSON.stringify(all))
  },
  async wipe() {
    localStorage.removeItem(KEY)
  },
}

/* ---------- Memory: tests ---------- */

export function memoryPersistence(initial: StoredRecord[] = []): Persistence & { records: Map<string, StoredRecord>; failNext: number; writes: number } {
  const records = new Map(initial.map((r) => [`${r.t}/${r.id}`, r]))
  return {
    records,
    failNext: 0,
    writes: 0,
    async load() {
      return [...records.values()].map((r) => ({ ...r, v: structuredClone(r.v) }))
    },
    async write(ops: Op[]) {
      if (this.failNext > 0) {
        this.failNext--
        throw new Error('disk full')
      }
      this.writes++
      for (const op of ops) {
        if (op.v == null) records.delete(`${op.t}/${op.id}`)
        else records.set(`${op.t}/${op.id}`, { t: op.t, id: op.id, v: structuredClone(op.v) })
      }
    },
    async wipe() {
      records.clear()
    },
  }
}

export const devicePersistence = (): Persistence => (isNative ? nativePersistence : browserPersistence)
