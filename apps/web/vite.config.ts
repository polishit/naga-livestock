import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Proxy to the API. While the API is still starting, answer with a clear message instead of a blank 500. */
const apiProxy: ProxyOptions = {
  target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (_err, _req, res) => {
      const r = res as import('node:http').ServerResponse;
      if (r && typeof r.writeHead === 'function' && !r.headersSent) {
        r.writeHead(503, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ error: 'The server is still starting. Wait a few seconds and try again.' }));
      }
    });
  },
};

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'login-bg.jpg', 'login-bg-sm.jpg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Naga City Livestock Monitoring',
        short_name: 'Naga City Vet',
        description: 'Livestock Monitoring System with GIS Integration — City Veterinary Office, Naga City',
        theme_color: '#7aad69',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; API GETs fall back to the last response when offline.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') &&
              request.method === 'GET' &&
              !url.pathname.startsWith('/api/auth'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': apiProxy,
      '/health': apiProxy,
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': apiProxy,
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          map: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any);