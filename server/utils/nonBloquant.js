// ── Erreurs « non bloquantes » : journalisées ET remontées à Sentry ─────────
//
// Le code contient plus d'une centaine de `.catch(() => {})` et de
// `catch { /* non-bloquant */ }` : notification, e-mail, ledger, mise à jour
// de disponibilité, ImageKit… Des actions qui ne doivent pas faire échouer la
// requête principale — mais qui, silencieuses, cachent des pannes entières
// (journal des SMS mort pendant des semaines, ligne de commission jamais
// écrite). Ici : on ne bloque toujours pas, mais on trace en avertissement
// et on remonte à Sentry avec le contexte, pour que la panne soit VISIBLE.
import logger from "./logger.js";
import { captureException } from "../config/sentry.js";

// Handler pour promesse : `promesse.catch(nonBloquant("bookingController"))`.
export function nonBloquant(contexte) {
  return (err) => signalerNonBloquant(contexte, err);
}

// Appel direct dans un bloc catch : `catch (err) { signalerNonBloquant("x", err); }`.
export function signalerNonBloquant(contexte, err, extra = {}) {
  const message = err?.message || String(err);
  logger.warn(`[non bloquant] ${contexte} : ${message}`);
  try {
    captureException(err instanceof Error ? err : new Error(message), { contexte, nonBloquant: true, ...extra });
  } catch { /* Sentry lui-même ne doit jamais faire échouer l'appelant */ }
}
