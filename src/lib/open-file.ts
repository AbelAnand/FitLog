import { MAX_FILE_BYTES, UnreadableFile, readImportFile, type ReadFile } from '../db/backup'
import { isNative } from './native'

/**
 * A file handed to the app from outside: tapped in Messages or Files ("Open in SplitLog"). iOS
 * copies it into the app's Inbox and tells Capacitor its file:// URL. Reading it here is the only
 * thing done with it; the copy is removed afterwards.
 */

export const isFileUrl = (url: string): boolean => /^file:/i.test(url)

/** The file's own name, for the preview. */
export function openedFileName(url: string): string {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop() ?? '') || 'Shared file'
  } catch {
    return 'Shared file'
  }
}

export async function readOpenedFile(url: string): Promise<{ read: ReadFile; name: string }> {
  if (!isNative) throw new UnreadableFile('Opening files is available in the iPhone app.')
  const { Filesystem, Encoding } = await import('@capacitor/filesystem')
  const stat = await Filesystem.stat({ path: url }).catch(() => null)
  if (stat && stat.size > MAX_FILE_BYTES) throw new UnreadableFile('This file is too large to be a SplitLog backup.')
  const { data } = await Filesystem.readFile({ path: url, encoding: Encoding.UTF8 })
  try {
    return { read: readImportFile(typeof data === 'string' ? data : await data.text()), name: openedFileName(url) }
  } finally {
    // The Inbox copy served its purpose; the log keeps what the person decides to add.
    Filesystem.deleteFile({ path: url }).catch(() => {})
  }
}
