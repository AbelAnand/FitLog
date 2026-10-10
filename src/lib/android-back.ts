import { App } from '@capacitor/app'

/*
 * The Android back gesture/button, made to behave like the iPhone's swipe-back.
 *
 * Capacitor's App plugin hands every back press to JavaScript as a `backButton` event once a
 * listener exists (without one the web view would walk its own history and, at the start of it,
 * do nothing). From the top down:
 *
 *   1. An open sheet closes, like tapping its backdrop.
 *   2. The workout editor's own Back button is pressed. It asks Save or Discard when there are
 *      unsaved changes (the state `setBackGesture(false)` reports) and leaves otherwise.
 *   3. While going back is switched off and nothing above applied, nothing happens.
 *   4. A root tab sends the app to the background, as Android expects; any other screen goes
 *      one step back.
 */

const ROOT_TABS = new Set(['/', '/history', '/progress', '/settings'])

let enabled = true

/** Mirror of setBackGesture for Android: off while a screen has unsaved changes. */
export function setAndroidBackEnabled(value: boolean): void {
  enabled = value
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const currentPath = () => {
  const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname
  return path.replace(/\/+$/, '') || '/'
}

/** Open a screen without a history entry to go back to (a cold start on a deep link). */
function goHome(): void {
  history.pushState({}, '', `${base}/`)
  dispatchEvent(new PopStateEvent('popstate'))
}

export function handleBack(): void {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  const close = dialogs[dialogs.length - 1]?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
  if (close) {
    close.click()
    return
  }
  const back = document.querySelector<HTMLButtonElement>('main button[aria-label="Back"]')
  if (back) {
    const path = currentPath()
    const entries = history.length
    back.click()
    // Nothing to go back to and no question asked (a cold start on a workout): Home it is.
    if (entries <= 1) {
      window.setTimeout(() => {
        if (currentPath() === path && !document.querySelector('[role="dialog"]')) goHome()
      }, 80)
    }
    return
  }
  if (!enabled) return
  if (ROOT_TABS.has(currentPath())) {
    App.minimizeApp().catch(() => {})
    return
  }
  if (history.length > 1) history.back()
  else goHome()
}

/** Start listening. Called once from main.tsx on Android. */
export function installAndroidBack(): void {
  App.addListener('backButton', handleBack)
}
