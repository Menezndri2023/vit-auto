import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/* global process */

import { OUTILS_PAR_SECTEUR, SOCLE_GRATUIT, GRATUIT_PAR_SECTEUR } from "./planFeatures";
import { ACTIVITIES } from "./partnerTaxonomy";
import translations from "../i18n/translations";

// ── La page Tarifs ne peut plus vendre ce que le serveur n'impose pas ───────
//
// Audit du 2026-09-26 : la table annonçait 25 outils par métier, le serveur
// n'en verrouillait que 8. Un chauffeur souscrivait Essentiel pour « Planning
// et indisponibilités » — que le palier gratuit lui donnait déjà. Ce n'est pas
// un défaut technique : c'est une promesse sans contrepartie, et un litige le
// jour où un partenaire s'en aperçoit.
//
// Le champ `feature` de chaque outil est le nom de sa garde serveur. Ce test
// relit server/constants/planFeatures.js — la matrice qui FAIT AUTORITÉ — et
// refuse tout écart. Il ne peut pas être satisfait en éditant la page.

const SERVEUR = readFileSync(resolve(process.cwd(), "server/constants/planFeatures.js"), "utf8");

/** FEATURE_MIN_PLAN, lu depuis la source serveur plutôt que dupliqué ici. */
function matriceServeur() {
  const bloc = SERVEUR.slice(SERVEUR.indexOf("export const FEATURE_MIN_PLAN"));
  const corps = bloc.slice(bloc.indexOf("{"), bloc.indexOf("\n};") + 1);
  const table = {};
  for (const m of corps.matchAll(/^\s*([a-zA-Z]+):\s*"([a-z_]+)"/gm)) table[m[1]] = m[2];
  return table;
}

const FEATURE_MIN_PLAN = matriceServeur();
const tousOutils = Object.entries(OUTILS_PAR_SECTEUR).flatMap(([secteur, paliers]) =>
  Object.entries(paliers).flatMap(([palier, outils]) => outils.map((o) => ({ secteur, palier, ...o }))));

describe("outils vendus par palier", () => {
  it("la matrice serveur a bien été lue", () => {
    expect(Object.keys(FEATURE_MIN_PLAN).length).toBeGreaterThan(8);
    expect(FEATURE_MIN_PLAN.importFlotte).toBe("business");
  });

  it("chaque outil annoncé porte le nom de sa garde serveur", () => {
    const sansGarde = tousOutils.filter((o) => !o.feature).map((o) => `${o.secteur}/${o.palier} ${o.key}`);
    expect(sansGarde, "un outil sans `feature` ne peut pas être vérifié").toEqual([]);
  });

  it("chaque garde annoncée existe côté serveur", () => {
    const inconnues = tousOutils.filter((o) => !FEATURE_MIN_PLAN[o.feature])
      .map((o) => `${o.key} → « ${o.feature} » absent de FEATURE_MIN_PLAN`);
    expect(inconnues).toEqual([]);
  });

  it("le palier annoncé est celui que le serveur impose", () => {
    // Un outil annoncé à Essentiel mais verrouillé à Business se vend à un
    // partenaire qui recevra un 403 — c'est la pire des deux erreurs.
    const ecarts = tousOutils
      .filter((o) => FEATURE_MIN_PLAN[o.feature] && FEATURE_MIN_PLAN[o.feature] !== o.palier)
      .map((o) => `${o.key} : annoncé « ${o.palier} », imposé « ${FEATURE_MIN_PLAN[o.feature]} »`);
    expect(ecarts).toEqual([]);
  });

  it("tout secteur déclaré a une entrée, même vide", () => {
    for (const secteur of ACTIVITIES) {
      expect(OUTILS_PAR_SECTEUR[secteur], `secteur « ${secteur} » absent`).toBeTruthy();
      expect(GRATUIT_PAR_SECTEUR[secteur], `socle gratuit de « ${secteur} » absent`).toBeTruthy();
    }
  });

  it("chaque libellé d'outil et de socle est traduit", () => {
    const cles = [...tousOutils.map((o) => o.key),
                  ...SOCLE_GRATUIT.map((x) => x.key),
                  ...Object.values(GRATUIT_PAR_SECTEUR).flat().map((x) => x.key)];
    const absentes = [...new Set(cles)].filter((c) => !translations[c]);
    expect(absentes, "clés sans traduction").toEqual([]);
  });

  it("aucun outil n'est vendu deux fois au même palier dans un secteur", () => {
    for (const [secteur, paliers] of Object.entries(OUTILS_PAR_SECTEUR)) {
      for (const [palier, outils] of Object.entries(paliers)) {
        const noms = outils.map((o) => o.feature);
        expect(new Set(noms).size, `${secteur}/${palier} répète une garde`).toBe(noms.length);
      }
    }
  });
});
