import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adresseAdminRequise, ADRESSE_VIT_AUTO } from "../utils/adresseAdmin.js";

// ═══════════════════════════════════════════════════════════════════════════
// UNE ADRESSE VIT AUTO DOIT POUVOIR RECEVOIR
// ═══════════════════════════════════════════════════════════════════════════
// Précision de l'exploitant (2026-09-25) : « admin@vitauto.ci n'est rattaché à
// aucun e-mail, le seul mail de VIT AUTO est contact@vit-auto.com ».
//
// Ce domaine était pourtant le défaut de QUATRE scripts d'administration, et
// l'adresse du compte administrateur unique en production. Mesuré sur les
// journaux d'envoi : 57 rebonds en 90 jours, première adresse en échec du
// service, et la seule qui ne soit pas un compte de test. Tout ce que la
// plateforme adressait à son propre administrateur tombait dans le vide.
//
// Un défaut qui ne peut pas recevoir est pire que pas de défaut : il marche en
// apparence et échoue en silence.

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Les sauvegardes figent un état passé et les tests citent le domaine mort à
// dessein (c'est leur sujet) ; les exclure, c'est ce que le test VEUT dire.
const IGNORE = [/node_modules/, /graphify-out/, /\/backups\//, /\/dist\//, /\.git\//,
                /adresseAdmin\.js$/, /adressesVitAuto\.test\.js$/, /emailsMaitrises\.test\.js$/,
                /suppressionEmail\.js$/, /BookingSuccess\.jsx$/];

function fichiers(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (IGNORE.some((r) => r.test(p))) continue;
    if (e.isDirectory()) fichiers(p, acc);
    else if (/\.(js|jsx|mjs|json|md|example)$/.test(e.name) || e.name === ".env.example") acc.push(p);
  }
  return acc;
}

describe("Adresses VIT AUTO", () => {
  it("aucun domaine vitauto.ci ne subsiste dans le code", () => {
    const coupables = [];
    for (const f of fichiers(path.join(racine, "server")).concat(fichiers(path.join(racine, "src")))) {
      const contenu = fs.readFileSync(f, "utf8");
      if (/@vitauto\.ci/i.test(contenu)) coupables.push(path.relative(racine, f));
    }
    expect(coupables, `domaine inexistant (57 rebonds/90 j) encore présent dans : ${coupables.join(", ")}`).toEqual([]);
  });

  // LE point. Le défaut précédent ne refusait rien : il inventait une adresse,
  // et l'échec n'apparaissait que dans les journaux d'envoi, des semaines plus
  // tard.
  it("exige une adresse plutôt que d'en inventer une", () => {
    for (const vide of [undefined, null, "", "   "]) {
      expect(() => adresseAdminRequise(vide), `valeur=${JSON.stringify(vide)}`).toThrow(/Aucune adresse/);
    }
  });

  it("dit QUOI faire quand elle manque — un refus sans issue ne sert à rien", () => {
    try {
      adresseAdminRequise("");
      throw new Error("aurait dû lever");
    } catch (e) {
      expect(e.message).toMatch(/ADMIN_SEED_EMAIL/);
      expect(e.message).toContain(ADRESSE_VIT_AUTO);
    }
  });

  it("normalise la casse — une adresse saisie en majuscules reste la même", () => {
    expect(adresseAdminRequise("  Contact@VIT-AUTO.com ")).toBe(ADRESSE_VIT_AUTO);
  });

  it("l'adresse de la plateforme est celle que l'exploitant a désignée", () => {
    expect(ADRESSE_VIT_AUTO).toBe("contact@vit-auto.com");
  });
});
