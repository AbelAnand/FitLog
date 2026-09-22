import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Deployed to GitHub Pages at https://abelanand.github.io/FitLog/
export default defineConfig({
  base: '/FitLog/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'FitLog',
        short_name: 'FitLog',
        description: 'Track your workouts and see your progression.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/FitLog/',
        scope: '/FitLog/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/FitLog/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Never cache API calls; data always comes from Supabase live.
        navigateFallbackDenylist: [/^\/FitLog\/api/],
      },
    }),
  ],
})
