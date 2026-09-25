import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/* global process */
import translations from "./translations";
import accueil from "./accueil";
import pagesPubliques from "./pagesPubliques";
import services from "./services";
import pourquoi from "./pourquoi";
import chrome from "./chrome";
import faq from "./faq";
import aide from "./aide";
import catalogue from "./catalogue";
import partenaires from "./partenaires";
import importExport from "./importExport";
import { CODES, LANGUES } from "./langueUrl";

// ── Une traduction incomplète est pire qu'une traduction absente ────────────
//
// `t()` se replie silencieusement sur le français quand une langue manque. Un
// visiteur arabe voit alors une page à moitié française sans que rien ne le
// signale — et surtout, la page déclare `hreflang="ar"` aux moteurs pour un
// contenu qui n'existe pas vraiment en arabe. Ce test rend l'oubli bruyant.

const MODULES = { accueil, pagesPubliques, services, pourquoi, chrome, faq, aide, catalogue, partenaires, importExport };

describe("complétude des traductions", () => {
  it("chaque clé porte les cinq langues, non vides", () => {
    const manquants = [];
    for (const [cle, valeurs] of Object.entries(translations)) {
      for (const code of CODES) {
        const v = valeurs?.[code];
        if (typeof v !== "string" || v.trim() === "") manquants.push(`${cle} → ${code}`);
      }
    }
    expect(manquants, `Traductions manquantes :\n${manquants.join("\n")}`).toEqual([]);
  });

  it("aucune clé n'est définie deux fois entre les modules", () => {
    // Le spread de translations.js écraserait la première définition sans
    // rien dire : on corrigerait une chaîne sans jamais voir l'effet.
    const base = // L'environnement de test est « jsdom » : import.meta.url y est une URL
    // http, pas un fichier. On repart de la racine du dépôt.
    readFileSync(resolve(process.cwd(), "src/i18n/translations.js"), "utf8");
    const clesBase = new Set(
      [...base.matchAll(/^\s{2}"([^"]+)":\s*\{/gm)].map((m) => m[1]),
    );
    const doublons = [];
    for (const [nom, mod] of Object.entries(MODULES)) {
      for (const cle of Object.keys(mod)) {
        if (clesBase.has(cle)) doublons.push(`${cle} (translations.js ↔ ${nom}.js)`);
      }
    }
    expect(doublons, `Clés en double :\n${doublons.join("\n")}`).toEqual([]);
  });

  it("aucune traduction non française ne laisse passer du texte français", () => {
    // Filet grossier mais efficace : une valeur `en`/`es`/`zh` identique au
    // français est presque toujours un copier-coller oublié. Les exceptions
    // légitimes (sigles, noms propres, « FAQ », « Contact »…) sont courtes.
    const suspects = [];
    for (const [cle, valeurs] of Object.entries(translations)) {
      for (const code of ["en", "es", "zh"]) {
        if (valeurs[code] === valeurs.fr && valeurs.fr.length > 24) {
          suspects.push(`${cle} → ${code} : « ${valeurs.fr.slice(0, 40)}… »`);
        }
      }
    }
    expect(suspects, `Traductions identiques au français :\n${suspects.join("\n")}`).toEqual([]);
  });

  it("les cinq langues déclarées ont toutes un code, un libellé et une direction", () => {
    for (const l of LANGUES) {
      expect(l.code, `code manquant`).toBeTruthy();
      expect(l.label, `libellé manquant pour ${l.code}`).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(l.dir);
      expect(l.htmlLang, `htmlLang manquant pour ${l.code}`).toBeTruthy();
    }
  });
});
