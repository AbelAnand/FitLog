import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { initNative, isNative } from './lib/native'

if (isNative) {
  initNative()
} else {
  // Service worker only for the web/PWA build; the native shell bundles assets itself.
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
