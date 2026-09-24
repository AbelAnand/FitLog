import { Capacitor } from '@capacitor/core'

/** True when running inside the Capacitor iOS shell rather than a browser. */
export const isNative = Capacitor.isNativePlatform()

/** One-time native setup: status bar style and keyboard behaviour. */
export async function initNative(): Promise<void> {
  if (!isNative) return
  const [{ StatusBar, Style }, { Keyboard }] = await Promise.all([import('@capacitor/status-bar'), import('@capacitor/keyboard')])
  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setOverlaysWebView({ overlay: true })
  // Number pads have no return key; the accessory bar's Done button is how you leave them.
  await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {})
}
