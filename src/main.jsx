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

// ── Écran blanc après un déploiement ────────────────────────────────────────
// L'application charge ses pages à la demande (61 imports différés). Après un
// déploiement, les fichiers de l'ancienne version disparaissent : un onglet
// resté ouvert qui navigue vers une page pas encore visitée demande un fichier
// qui n'existe plus, reçoit la page HTML à la place, et le navigateur refuse de
// l'exécuter — panneau blanc jusqu'à ce que la vérification de version passe
// (jusqu'à 15 min). On recharge une seule fois, silencieusement : la page
// demandée s'ouvre alors avec la nouvelle version.
const RELOAD_FLAG = "vitauto_chunk_reload";
const isStaleChunkError = (msg = "") =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);

const reloadOnceForStaleChunk = (msg) => {
  if (!isStaleChunkError(msg)) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return; // déjà tenté : ne pas boucler
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch { /* stockage indisponible — on recharge quand même une fois */ }
  window.location.reload();
};

window.addEventListener("error", (e) => reloadOnceForStaleChunk(e?.message));
window.addEventListener("unhandledrejection", (e) => reloadOnceForStaleChunk(e?.reason?.message || String(e?.reason || "")));
// Chargement réussi : on réarme le mécanisme pour le prochain déploiement.
window.addEventListener("load", () => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ } });

// GoogleAuthButton.jsx se masque lui-même si VITE_GOOGLE_CLIENT_ID est absent
// — un clientId vide ici ne casse rien tant qu'aucun <GoogleLogin> n'est monté.
createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
    <App />
  </GoogleOAuthProvider>
)
