import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { PASSWORD_ROUNDS, CODE_ROUNDS } from "../config/security.js";

// Le coût bcrypt est abaissé EN TEST seulement. Ce fichier verrouille les deux
// moitiés de cette affirmation : que le coût soit bien réduit ici, et que la
// production ne soit jamais concernée.

describe("Coût de hachage bcrypt", () => {
  it("est réduit en test — c'est bcrypt qui dominait la durée de la suite", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(PASSWORD_ROUNDS).toBeLessThan(12);
    expect(CODE_ROUNDS).toBeLessThan(10);
  });

  it("ne descend jamais sous un plancher praticable", () => {
    // Un coût de 1 ou 2 ferait des hashs quasi instantanés : les tests
    // cesseraient d'exercer un vrai hachage.
    expect(PASSWORD_ROUNDS).toBeGreaterThanOrEqual(4);
    expect(CODE_ROUNDS).toBeGreaterThanOrEqual(4);
  });

  it("vérifie encore un hash produit au coût de PRODUCTION", async () => {
    // Le point qui rend la réduction sans risque : bcrypt lit le coût DANS le
    // hash. Un mot de passe haché à 12 en production doit continuer de se
    // vérifier, quel que soit le réglage local.
    const hashProduction = await bcrypt.hash("MotDePasse123", 12);
    expect(await bcrypt.compare("MotDePasse123", hashProduction)).toBe(true);
    expect(await bcrypt.compare("mauvais", hashProduction)).toBe(false);
  });

  it("un hash de test se vérifie aussi", async () => {
    const h = await bcrypt.hash("MotDePasse123", PASSWORD_ROUNDS);
    expect(await bcrypt.compare("MotDePasse123", h)).toBe(true);
    expect(await bcrypt.compare("mauvais", h)).toBe(false);
  });
});
