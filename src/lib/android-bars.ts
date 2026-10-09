import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { THEMES } from './theme'

/*
 * Android system bars. Capacitor's SystemBars plugin draws the web view edge to edge; this keeps
 * the status bar and gesture bar icons readable for the chosen theme. theme.ts already sets the
 * status bar through the StatusBar plugin on both platforms; the gesture bar is Android's alone.
 *
 * The theme is read from `data-theme` on <html> (set by applyTheme), so this needs nothing from
 * React and no change to theme.ts.
 */

function styleFor(themeId: string | undefined): SystemBarsStyle {
  const meta = THEMES.find((t) => t.id === (themeId ?? 'volt'))
  // Style.Light means light bars with dark icons, for the two light themes.
  return meta?.light ? SystemBarsStyle.Light : SystemBarsStyle.Dark
}

export function installAndroidBars(): void {
  const root = document.documentElement
  const apply = () => { SystemBars.setStyle({ style: styleFor(root.dataset.theme) }).catch(() => {}) }
  apply()
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
}
