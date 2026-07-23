import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identifiant de build unique par déploiement (SHA du commit sur Vercel, sinon
// horodatage en local) — sert à détecter côté client qu'une nouvelle version a
// été déployée pendant qu'un onglet/PWA restait ouvert avec l'ancien bundle en
// mémoire (voir src/hooks/useVersionCheck.js).
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

// Écrit dist/version.json (servi avec Cache-Control: no-cache, cf vercel.json)
// pour que le client puisse comparer sa propre version à celle réellement en
// ligne, sans dépendre du service worker (qui ne se réinstalle que si sw.js
// lui-même change).
const versionFilePlugin = () => ({
  name: 'write-version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: APP_VERSION }),
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), versionFilePlugin()],

  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target:       'http://localhost:5001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Backend non disponible' }));
              }
              return;
            }
            console.error('[proxy]', err.message);
          });
        },
      },
    },
  },

  build: {
    outDir:           'dist',
    sourcemap:        mode === 'development',
    cssCodeSplit:     true,
    assetsInlineLimit: 8192,
    rollupOptions: {
      output: {
        // Ne grouper QUE les libs vraiment partagées par toutes les pages (React).
        // Grouper des pages lazy() sans rapport (admin/vendor/booking) sous un même nom
        // les transforme en "chunks partagés entre plusieurs entrées async" — Rollup les
        // preload alors sur TOUTE route au lieu de les charger à la demande par page.
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react';
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}))
