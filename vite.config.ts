import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// FitLog is an iPhone app: this bundle is what the native shell in ios/ loads.
// `npm run dev` serves the same bundle in a browser for development, with storage in the browser.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
