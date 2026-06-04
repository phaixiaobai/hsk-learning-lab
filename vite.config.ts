import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ================================================================
// Vite + PWA configuration
// ----------------------------------------------------------------
// This config produces a fully static SPA that can be hosted on
// any static host (GitHub Pages, Vercel, Netlify, S3, etc.) and
// registers a service worker so the app works offline on iPadOS.
// ================================================================

export default defineConfig({
  // `base` must be set if you deploy to a sub-path like GitHub Pages.
  // Example: base: '/hsk-master-pwa/'
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'HSK Lab – Mandarin Learning Platform',
        short_name: 'HSK Lab',
        description: 'Interactive HSK 2-4 Mandarin learning with flashcards, voice quiz, writing, and analytics.',
        theme_color: '#c1272d',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the static assets so the app launches offline after the first run
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        runtimeCaching: [
          {
            // Cache hanzi-writer stroke data (CDN JSON files) for offline practice
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hanzi-writer-data',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
