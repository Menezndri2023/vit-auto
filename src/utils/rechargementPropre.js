// ── Rechargement « propre » : sans service worker ni caches ────────────────
// Un fichier de page introuvable malgré un rechargement signifie qu'une copie
// périmée est servie quelque part entre le navigateur et le site : ancien
// service worker encore aux commandes, Cache Storage, cache HTTP. Avant de
// recharger, on désinscrit le worker et on vide les caches de cette origine,
// puis on recharge avec un cache-buster : le navigateur repart de zéro sur la
// version en ligne. Sans effet de bord : le worker se réinscrit au chargement
// suivant (main.jsx).
export async function rechargerProprement() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch { /* ignore */ }
  try {
    if (typeof caches !== "undefined") {
      const cles = await caches.keys();
      await Promise.all(cles.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
}
