import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { initNative, isAndroid, isNative } from './lib/native'
import { applyTheme, loadTheme } from './lib/theme'

if (isNative) initNative()
// Android's back gesture/button: closes sheets, asks Save or Discard, backgrounds the app from a tab.
if (isAndroid) import('./lib/android-back').then((m) => m.installAndroidBack())

loadTheme().then(applyTheme)

// Tapping anything that isn't a text field dismisses the keyboard, like native apps.
//
// Timing matters: putting the keyboard away resizes the web view, which moves everything under
// the finger. If that happens on touch-down, the tap lands on whatever slid into place and the
// button that was pressed never gets its click. So a press on a control leaves the keyboard alone
// until the click has been delivered; only presses on empty space dismiss it straight away.
const isTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'range'].includes(el.type))
const CONTROL = 'button, a, label, select, summary, [role="button"], [role="switch"], [role="checkbox"]'

document.addEventListener(
  'pointerdown',
  (e) => {
    const active = document.activeElement
    if (!isTextField(active)) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea, [data-keep-keyboard]')) return
    if (target?.closest(CONTROL)) return
    active.blur()
  },
  { capture: true },
)

document.addEventListener('click', (e) => {
  const active = document.activeElement
  if (!isTextField(active)) return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, [data-keep-keyboard]')) return
  // The handler for this click has already run; if it moved focus to another field, keep the keyboard.
  window.setTimeout(() => {
    if (document.activeElement === active) active.blur()
  }, 0)
})

// Dragging the page puts the keyboard away too (no click follows a drag, so nothing can be missed).
let dragStartY: number | null = null
document.addEventListener('touchstart', (e) => { dragStartY = e.touches[0]?.clientY ?? null }, { passive: true })
document.addEventListener(
  'touchmove',
  (e) => {
    if (dragStartY == null || Math.abs((e.touches[0]?.clientY ?? dragStartY) - dragStartY) < 24) return
    dragStartY = null
    const active = document.activeElement
    const target = e.target as HTMLElement | null
    if (isTextField(active) && !target?.closest('input, textarea, [data-keep-keyboard]')) active.blur()
  },
  { passive: true },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
