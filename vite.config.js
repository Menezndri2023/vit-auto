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

  // ── Vérification LOCALE du paquet construit ──────────────────────────────
  // Consigne du 2026-09-11 : rien ne part en production sans avoir été exercé
  // localement. `vite preview` sert le contenu de dist/ — c'est-à-dire
  // exactement ce qui sera déployé, service worker compris — mais il n'avait
  // aucun relais d'API : la page se chargeait sans données, et ne montrait donc
  // rien de ce qu'un visiteur verrait.
  //
  // Le relais pointe sur l'API de PRODUCTION et non sur un serveur local : on
  // veut vérifier le rendu avec les vraies annonces et les vraies images, sans
  // dépendre d'une base locale ni risquer d'écrire dans la vraie par
  // inadvertance. Aucun effet sur le build : `preview` ne sert qu'au contrôle
  // avant publication.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target:       'https://vit-auto-api.onrender.com',
        changeOrigin: true,
        secure:       true,
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
          // Barres obliques finales OBLIGATOIRES : 'node_modules/react' matchait
          // aussi react-leaflet, qui entraînait tout Leaflet dans le chunk
          // chargé par CHAQUE visiteur, page d'accueil comprise (386 Ko).
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'react';
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}))
