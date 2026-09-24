import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { initNative, isNative } from './lib/native'
import { applyTheme, loadTheme } from './lib/theme'

if (isNative) {
  initNative()
} else {
  // Service worker only for the web/PWA build; the native shell bundles assets itself.
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

loadTheme().then(applyTheme)

// Tapping anything that isn't a text field dismisses the keyboard, like native apps.
document.addEventListener(
  'pointerdown',
  (e) => {
    const active = document.activeElement as HTMLElement | null
    if (!active || !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return
    const target = e.target as HTMLElement | null
    if (target && (target.closest('input, textarea') || target.closest('[data-keep-keyboard]'))) return
    active.blur()
  },
  { capture: true },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
