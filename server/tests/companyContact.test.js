import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COMPANY, COMPANY_ADDRESS } from "../constants/company.js";
import { getCustomerServiceContact } from "../utils/customerServiceContact.js";

// Identité et contacts de l'entreprise — deux copies, une seule vérité.
//
// `server/constants/company.js` et `src/constants/company.js` sont des miroirs.
// Le 2026-09-08, le numéro marocain a été corrigé côté interface et OUBLIÉ côté
// serveur : pendant ce temps, le pied de page de tous les e-mails a continué
// d'afficher un numéro injoignable depuis l'étranger. C'est exactement le
// travers que la duplication produit, et ce test le rend impossible à répéter.

const FRONT = fs.readFileSync(
  path.join(process.cwd(), "../src/constants/company.js"), "utf8"
);

const valeurFront = (cle) => (FRONT.match(new RegExp(`${cle}:\\s*"([^"]+)"`)) || [])[1];

describe("Identité de l'entreprise — miroir front / serveur", () => {
  for (const cle of ["name", "street", "city", "country", "email", "website", "phoneMA", "phoneCI"]) {
    it(`« ${cle} » est identique des deux côtés`, () => {
      expect(valeurFront(cle), `${cle} absent de src/constants/company.js`).toBeTruthy();
      expect(COMPANY[cle], `${cle} diverge entre le serveur et l'interface`).toBe(valeurFront(cle));
    });
  }
});

describe("Numéros du service client — composables depuis l'étranger", () => {
  it("le numéro marocain ne traîne pas le préfixe national 0", () => {
    // « +2120 6… » échoue en composition internationale. Le 0 marocain est un
    // préfixe NATIONAL : il disparaît dès qu'on préfixe l'indicatif pays.
    expect(COMPANY.phoneMA).not.toMatch(/^\+2120/);
    expect(COMPANY.phoneMA).toMatch(/^\+212[5-7]\d{8}$/);
  });

  it("le numéro ivoirien conserve ses 10 chiffres", () => {
    // La Côte d'Ivoire n'a pas de préfixe national depuis la renumérotation :
    // les 10 chiffres suivent directement l'indicatif, rien à retirer.
    expect(COMPANY.phoneCI).toMatch(/^\+225\d{10}$/);
  });

  it("tout numéro est en forme E.164 stricte — aucun espace ni ponctuation", () => {
    for (const tel of [COMPANY.phoneMA, COMPANY.phoneCI]) {
      expect(tel, `${tel} n'est pas utilisable dans un lien tel:`).toMatch(/^\+\d{8,15}$/);
    }
  });

  it("le contact renvoyé aux e-mails suit le pays, et reste composable", () => {
    const ma = getCustomerServiceContact("MA");
    const ci = getCustomerServiceContact("CI");

    expect(ma.tel).toBe(COMPANY.phoneMA);
    expect(ci.tel).toBe(COMPANY.phoneCI);
    expect(ma.address).toBe(COMPANY_ADDRESS);
    // Le pied de page des e-mails compose `${address} | ${tel}` : ni l'un ni
    // l'autre ne doit être vide, sous peine d'un séparateur orphelin.
    for (const c of [ma, ci]) {
      expect(c.address?.trim()).toBeTruthy();
      expect(c.tel?.trim()).toBeTruthy();
    }
  });

  it("l'adresse du siège porte bien la ville et le pays", () => {
    expect(COMPANY_ADDRESS).toContain(COMPANY.city);
    expect(COMPANY_ADDRESS).toContain(COMPANY.country);
  });
});
