import { lazy } from "react";

// ── Chargement différé qui ne casse pas l'écran ─────────────────────────────
//
// « Importing a module script failed. » (Safari) / « Failed to fetch
// dynamically imported module » (Chrome) : le fichier d'une page demandé à la
// volée n'arrive pas — réseau mobile qui décroche, ou déploiement entre deux
// clics (l'ancien fichier n'existe plus, la réécriture Vercel renvoie
// index.html à sa place). Jusqu'ici : une seule tentative, puis l'écran
// d'erreur — vu par l'exploitant sur le panneau admin le 2026-09-18.
//
// Désormais chaque page différée est demandée jusqu'à trois fois (0,5 s, 1 s),
// puis, si le fichier manque toujours, la page est rechargée UNE fois avec un
// cache-buster (nouvelle version de l'application) ; l'écran d'erreur ne
// reste que si cela échoue encore dans les 30 s.
const ERREUR_DE_CHARGEMENT = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading (CSS )?chunk|ChunkLoadError|Unable to preload CSS/i;
// MÊME clé que la frontière d'erreur (ErrorBoundary.jsx) : le rechargement
// fait ici compte pour elle, sinon elle rechargerait une seconde fois avant
// d'afficher l'écran d'erreur — et la garde (scénario « fichier manquant après
// déploiement ») attend l'écran en moins de dix secondes.
const CLE = "vit-auto-rechargement-apres-deploiement";
const DELAIS_MS = [500, 1000];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export async function importerAvecReprise(chargeur) {
  let derniere;
  for (let tentative = 0; tentative <= DELAIS_MS.length; tentative++) {
    try {
      return await chargeur();
    } catch (err) {
      derniere = err;
      if (!ERREUR_DE_CHARGEMENT.test(String(err?.message || err))) throw err;
      if (tentative < DELAIS_MS.length) await attendre(DELAIS_MS[tentative]);
    }
  }
  // Toujours en échec après trois essais : nouvelle version probable.
  try {
    const dernier = Number(sessionStorage.getItem(CLE) || 0);
    if (Date.now() - dernier > 30_000) {
      sessionStorage.setItem(CLE, String(Date.now()));
      const url = new URL(window.location.href);
      url.searchParams.set("v", String(Date.now()));
      window.location.replace(url.toString());
      // Le rechargement prend la main ; on rend une promesse qui ne se résout pas.
      return new Promise(() => {});
    }
  } catch { /* stockage indisponible : on laisse l'erreur remonter */ }
  throw derniere;
}

export const lazyAvecReprise = (chargeur) => lazy(() => importerAvecReprise(chargeur));
