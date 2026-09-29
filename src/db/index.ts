import { LocalDb } from './db'
import { devicePersistence } from './persistence'

/** The one database of this app. */
export const db = new LocalDb(devicePersistence())

export { LocalDb, NotFound } from './db'
export type { ImportSummary } from './db'
