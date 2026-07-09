import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
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
