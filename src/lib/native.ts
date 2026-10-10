import { Capacitor, registerPlugin } from '@capacitor/core'

/** 'ios', 'android' or 'web'. */
export const platform = Capacitor.getPlatform()

/** True when running inside the Capacitor shell (iPhone or Android) rather than a browser. */
export const isNative = Capacitor.isNativePlatform()
export const isIOS = platform === 'ios'
export const isAndroid = platform === 'android'

/** What to call the device in copy: "iPhone" on iOS, "phone" on Android (and in a browser, where the text is about the phone app). */
export const deviceName = isIOS ? 'iPhone' : 'phone'

/** One-time native setup: status bar style and keyboard behaviour. */
export async function initNative(): Promise<void> {
  if (!isNative) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setStyle({ style: Style.Dark })
  if (isIOS) {
    await StatusBar.setOverlaysWebView({ overlay: true })
    // Number pads have no return key; the accessory bar's Done button is how you leave them.
    const { Keyboard } = await import('@capacitor/keyboard')
    await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {})
  }
  if (isAndroid) {
    // Edge-to-edge is set up natively (SystemBars in capacitor.config.ts); this keeps the gesture
    // bar's icons readable when a light theme is chosen.
    const { installAndroidBars } = await import('./android-bars')
    installAndroidBars()
  }
}

const BackGesture = registerPlugin<{ setEnabled(options: { enabled: boolean }): Promise<void> }>('BackGesture')

/**
 * Switch going back by gesture on or off (off while a screen has unsaved changes).
 * iPhone: the edge swipe of the web view. Android: the system back gesture/button, handled in
 * android-back.ts, which asks Save or Discard instead of leaving.
 */
export async function setBackGesture(enabled: boolean): Promise<void> {
  if (!isNative) return
  if (isAndroid) {
    const { setAndroidBackEnabled } = await import('./android-back')
    setAndroidBackEnabled(enabled)
  }
  await BackGesture.setEnabled({ enabled }).catch(() => {})
}
