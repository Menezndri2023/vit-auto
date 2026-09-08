import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE RENDU DE L'INTERFACE
// ═══════════════════════════════════════════════════════════════════════════
// Ajoutés le 2026-09-08, après trois pannes de production que la suite serveur
// (1040 tests), le lint et le build avaient tous laissé passer — parce
// qu'aucun d'eux n'exécute un composant React :
//
//   • le panneau d'administration entier remplacé par un écran d'erreur
//     (constante lue avant sa déclaration dans un tableau de dépendances) ;
//   • le service worker jamais enregistré (script inline bloqué par la CSP) ;
//   • le CV des chauffeurs illisible (fichier déposé dans un dossier privé).
//
// Ces tests ne vérifient pas l'apparence : ils vérifient qu'un écran critique
// SE RENDER SANS LEVER D'EXCEPTION, pour un rôle donné. C'est exactement la
// classe de bug qui échappait à tout le reste.
//
// Configuration séparée de vite.config.js (build) et de server/ (qui a sa
// propre suite avec mongodb-memory-server) : `npm test` ne lance que le front.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Voir src/test/socketStub.js : sans ce double, chaque écran monté
      // laissait une connexion temps réel se relancer à l'infini, et la suite
      // finissait par se figer.
      "socket.io-client": new URL("./src/test/socketStub.js", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    exclude: ["node_modules", "server", "dist", "android", "ios"],
    // Le rendu d'un écran aussi gros que le panneau d'administration prend du
    // temps au premier import (chunk de ~550 ko).
    testTimeout: 30000,
    restoreMocks: true,
    // Processus séparés plutôt que fils d'exécution : monter puis démonter
    // successivement plusieurs arbres de contextes complets dans un worker
    // jsdom partagé finissait par bloquer indéfiniment (blocage synchrone, que
    // le délai d'expiration ne peut pas interrompre). Un peu plus lent, mais
    // une suite qui se fige n'a aucune valeur.
    pool: "forks",
  },
});
