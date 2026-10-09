/*
 * Handing a text file to another app on Android.
 *
 * src/lib/csv.ts writes the file to the cache, shares it, and deletes it as soon as the share
 * sheet reports it done. That is right on iPhone, where the sheet finishes with the file first.
 * On Android the file goes to the chosen app as a content URI (FileProvider, res/xml/file_paths.xml)
 * and the share resolves the moment an app is chosen, before Drive or Gmail has necessarily read
 * it. So here the copy stays in cache/shared/ until the next share replaces it; the cache is the
 * app's own and the system trims it when space is short.
 *
 * Wire-up (one line at the top of shareTextFile in csv.ts):
 *   if (isAndroid) return shareTextFileAndroid(filename, text)
 */

export type AndroidShareResult = 'shared' | 'cancelled'

const FOLDER = 'shared'

export async function shareTextFileAndroid(filename: string, text: string): Promise<AndroidShareResult> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  await Filesystem.rmdir({ path: FOLDER, directory: Directory.Cache, recursive: true }).catch(() => {})
  const written = await Filesystem.writeFile({ path: `${FOLDER}/${filename}`, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
  try {
    await Share.share({ title: filename, url: written.uri })
    return 'shared'
  } catch (e) {
    // The Share plugin rejects with "Share canceled" when the sheet is dismissed.
    if (/cancel/i.test((e as Error).message ?? '')) return 'cancelled'
    throw e
  }
}
