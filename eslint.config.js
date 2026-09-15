import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import lectureAvantDeclaration from './eslint-rules/lecture-avant-declaration.js'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { vit: { rules: { 'lecture-avant-declaration': lectureAvantDeclaration } } },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Zone morte temporelle au rendu — voir eslint-rules/lecture-avant-declaration.js.
      'vit/lecture-avant-declaration': 'error',
      'react-hooks/purity': 'off', // faux positifs sur les event handlers (React Compiler non utilisé)
      // Règles du React Compiler (non utilisé ici) : « preserve-manual-memoization »
      // et « immutability » signalent des motifs que le compilateur ne saurait
      // pas optimiser, pas des défauts à l'exécution — une fonction déclarée
      // (hoistée) appelée plus haut dans le composant n'est pas une TDZ.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  {
    // Les contextes exportent volontairement leur fournisseur ET leur hook
    // (useAuth, useCart…) : c'est leur interface, pas un oubli de découpe.
    files: ['src/context/*.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
