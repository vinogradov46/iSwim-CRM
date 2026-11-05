import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'iSwim CRM',
        short_name: 'iSwim CRM',
        description: 'CRM школы плавания iSwim',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#eef4f8',
        theme_color: '#0a7cc4',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, navigateFallback: '/index.html' },
    }),
  ],
})
