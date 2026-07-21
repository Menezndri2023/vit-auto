import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'

// No-op silencieux si VITE_SENTRY_DSN n'est pas configurée (même logique
// défensive que server/config/sentry.js côté backend).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  })
}

// GoogleAuthButton.jsx se masque lui-même si VITE_GOOGLE_CLIENT_ID est absent
// — un clientId vide ici ne casse rien tant qu'aucun <GoogleLogin> n'est monté.
createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
    <App />
  </GoogleOAuthProvider>
)
