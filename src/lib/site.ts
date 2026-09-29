/** FitLog's public pages. */
export const WEB_URL = 'https://abelanand.github.io/FitLog/'
export const PRIVACY_URL = `${WEB_URL}privacy.html`
export const SUPPORT_URL = `${WEB_URL}support.html`
export const GUIDE_URL = `${WEB_URL}guide.html`

/** Open a page outside the app (Safari on the phone, a new tab in a browser). */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener')
}
