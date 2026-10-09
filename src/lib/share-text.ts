import { isNative } from './native'

export type ShareTextResult = 'shared' | 'copied' | 'cancelled'

/**
 * Hand a short piece of text to the person. iPhone: the share sheet (Messages, Mail, Copy…).
 * Browser: the Web Share API where there is one, otherwise the clipboard.
 */
export async function shareText(text: string, title?: string): Promise<ShareTextResult> {
  if (isNative) {
    const { Share } = await import('@capacitor/share')
    try {
      await Share.share({ title, text })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test((e as Error).message ?? '')) return 'cancelled'
      throw e
    }
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // Not supported for plain text here: fall through to the clipboard.
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
