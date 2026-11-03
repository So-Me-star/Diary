import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Diary/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '我的日记',
        short_name: '日记',
        description: '记录生活中的每一个瞬间',
        theme_color: '#f7f3ef',
        background_color: '#f7f3ef',
        display: 'standalone',
        start_url: '/Diary/',
        scope: '/Diary/',
        icons: [
          {
            src: '/Diary/diary-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ]
})
