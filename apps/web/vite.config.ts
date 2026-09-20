import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Samity Manager',
        short_name: 'Samity',
        description: 'সমিতি ও এনজিও-এমএফআই ব্যবস্থাপনা / Cooperative society & NGO-MFI management',
        lang: 'bn',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    // Dev convenience: same-origin /api/v1 → local API, so no CORS setup is
    // needed while developing. Production uses the real gateway origin.
    proxy: process.env.NODE_ENV !== 'production' ? { '/api/v1': 'http://localhost:4000' } : undefined,
  },
});
