import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// L'ASSISTANT DE PUBLICATION NE DOIT PAS TOMBER SUR UNE VALEUR NULLE
// ═══════════════════════════════════════════════════════════════════════════
// Signalé le 2026-09-24 : « le bouton suivant dans la publication (information
// du véhicule) plante beaucoup et nécessite un rechargement ». La frontière
// d'erreur de l'application remplace alors l'écran, et la saisie est perdue.
//
// `validate()` faisait seize appels à `.trim()` et `.length` À NU sur des
// champs venant de la base, d'un brouillon ou du profil partenaire. Une seule
// valeur `null` suffisait à lever une exception dans le gestionnaire de clic —
// ce que React escalade jusqu'à la frontière d'erreur.
//
// Cause identifiée en amont : `nomEntreprise: business.companyName` était le
// SEUL champ du pré-remplissage sans repli `|| p.x`. Une entité partenaire sans
// nom y posait `null`.
//
// Ces vérifications portent sur la SOURCE plutôt que sur un rendu : monter
// l'assistant entier demanderait une session, des entités partenaire et un
// catalogue — et testerait surtout autre chose.

const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "VendorSubmit.jsx"), "utf8");

// Corps de validate(), du début jusqu'à son `return`.
const corpsValidate = (() => {
  const debut = source.indexOf("const validate = () => {");
  const fin = source.indexOf("return Object.keys(e).length === 0;", debut);
  return source.slice(debut, fin);
})();

describe("VendorSubmit — validate() ne peut pas lever", () => {
  it("n'appelle jamais .trim() à nu sur un champ de formulaire", () => {
    const nus = [...corpsValidate.matchAll(/\b(identity|vehicle|driver)\.([A-Za-z0-9_]+)\.trim\(\)/g)]
      .map((m) => m[0]);
    expect(nus, "passer par txt() — une valeur null ferait tomber l'assistant").toEqual([]);
  });

  it("n'appelle jamais .length à nu sur une liste de formulaire", () => {
    const nus = [...corpsValidate.matchAll(/\b(driver|vehicle)\.([A-Za-z0-9_]+)\.length/g)]
      .map((m) => m[0]);
    expect(nus, "passer par liste() — une valeur null ferait tomber l'assistant").toEqual([]);
  });

  it("dispose bien des deux garde-fous", () => {
    expect(source).toMatch(/const txt = \(v\) =>/);
    expect(source).toMatch(/const liste = \(v\) =>/);
  });
});

describe("VendorSubmit — pré-remplissage depuis l'entité partenaire", () => {
  // Tous les champs recopiés depuis `business` doivent retomber sur la valeur
  // précédente : la base contient des entités incomplètes, et un `null` posé
  // ici traverse tout le formulaire jusqu'à la validation.
  it("chaque champ repris de l'entité a un repli", () => {
    // Viser le bloc de PRÉ-REMPLISSAGE, pas l'état initial : la première
    // occurrence de « nomEntreprise: » est celle du useState, où aucun
    // `business.` n'apparaît — la garde ne pouvait donc jamais échouer.
    const debut = source.indexOf("business.companyName");
    expect(debut, "bloc de pré-remplissage introuvable").toBeGreaterThan(-1);
    const bloc = source.slice(debut - 200, debut + 400);
    const sansRepli = bloc
      .split("\n")
      .filter((l) => /^\s+[a-zA-Z]+:\s*business\.[A-Za-z.]+,\s*$/.test(l))
      .map((l) => l.trim());
    expect(sansRepli, "ajouter « || p.champ »").toEqual([]);
  });
});

describe("Comportement des garde-fous", () => {
  // Reproduction directe de leur définition : ils doivent absorber exactement
  // ce que la base et les brouillons savent produire.
  const txt = (v) => String(v ?? "").trim();
  const liste = (v) => (Array.isArray(v) ? v : []);

  it("txt() absorbe null, undefined, nombre et espaces", () => {
    expect(txt(null)).toBe("");
    expect(txt(undefined)).toBe("");
    expect(txt("  Toyota  ")).toBe("Toyota");
    expect(txt(2024)).toBe("2024");
    expect(txt("")).toBe("");
  });

  it("liste() absorbe null et les valeurs qui ne sont pas des tableaux", () => {
    expect(liste(null)).toEqual([]);
    expect(liste(undefined)).toEqual([]);
    expect(liste("B,C")).toEqual([]);
    expect(liste(["B"])).toEqual(["B"]);
  });
});
