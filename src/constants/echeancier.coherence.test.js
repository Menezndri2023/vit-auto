import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { statutEcheance, resteAEncaisser, LIBELLE_ECHEANCE, COULEUR_ECHEANCE } from "./echeancier";

// ── Le miroir front dit-il la même chose que le serveur ? ──────────────────
//
// `src/constants/echeancier.js` reproduit la règle de
// `server/services/miseADisposition.js` pour l'AFFICHAGE. Deux écritures de la
// même règle divergent toujours ; ici la garde relit le serveur et refuse
// l'écart, sur le même principe que `planFeatures.coherence.test.js`.
//
// La divergence était déjà arrivée : les deux tableaux de bord comparaient les
// dates sur place, et ni l'un ni l'autre ne traitait la commande ANNULÉE — un
// contrat annulé affichait encore « à régler » sur des mois qui ne sont plus dus.
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVEUR = readFileSync(join(RACINE, "server/services/miseADisposition.js"), "utf8");

describe("Échéancier — miroir front ↔ règle serveur", () => {
  it("la liste des statuts de commande qui éteignent une échéance est identique", () => {
    const cote = (src) => {
      const m = src.match(/(?:ANNULES|COMMANDES_ANNULEES)\s*=\s*new Set\(\[([^\]]*)\]\)/);
      expect(m, "liste des statuts annulés introuvable — le miroir ou le serveur a changé de forme").toBeTruthy();
      return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    };
    const serveur = cote(SERVEUR);
    const front = cote(readFileSync(join(RACINE, "src/constants/echeancier.js"), "utf8"));
    expect(serveur.length).toBeGreaterThan(0);
    expect(front, `Le front éteint ${front.join(", ")} ; le serveur éteint ${serveur.join(", ")}`).toEqual(serveur);
  });

  it("les quatre statuts ont un libellé et une couleur", () => {
    // Un statut sans libellé s'afficherait vide : le client verrait une ligne
    // de montant sans savoir si elle est due.
    for (const s of ["reglee", "annulee", "due", "a_venir"]) {
      expect(LIBELLE_ECHEANCE[s], `libellé manquant pour « ${s} »`).toBeTruthy();
      expect(COULEUR_ECHEANCE[s], `couleur manquante pour « ${s} »`).toBeTruthy();
    }
  });

  it("réglée l'emporte sur annulée : ce qui fut encaissé le reste", () => {
    const e = { dateEcheance: "2020-01-01", regleeLe: "2020-01-02" };
    expect(statutEcheance(e, "cancelled")).toBe("reglee");
  });

  it("une commande annulée éteint ce qui restait dû", () => {
    expect(statutEcheance({ dateEcheance: "2020-01-01" }, "cancelled")).toBe("annulee");
    expect(statutEcheance({ dateEcheance: "2099-01-01" }, "cancelled")).toBe("annulee");
  });

  it("sinon, la date tranche entre « due » et « à venir »", () => {
    expect(statutEcheance({ dateEcheance: "2020-01-01" }, "confirmed")).toBe("due");
    expect(statutEcheance({ dateEcheance: "2099-01-01" }, "confirmed")).toBe("a_venir");
  });

  it("le reste à encaisser ignore le réglé ET l'annulé", () => {
    const ech = [
      { numero: 1, dateEcheance: "2020-01-01", montantUSD: 900, regleeLe: "2020-01-02" },
      { numero: 2, dateEcheance: "2020-02-01", montantUSD: 900 },
      { numero: 3, dateEcheance: "2099-01-01", montantUSD: 900 },
    ];
    expect(resteAEncaisser(ech, "confirmed")).toBe(1800);
    // Contrat annulé : seul ce qui fut réglé compte, plus rien n'est dû.
    expect(resteAEncaisser(ech, "cancelled")).toBe(0);
  });
});
