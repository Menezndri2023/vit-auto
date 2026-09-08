import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import * as module from "../utils/emailVerificationRequired.js";
import { emailVerificationRequiredForKyc } from "../utils/emailVerificationRequired.js";
import { login } from "../controllers/authController.js";
import { createUser } from "./helpers/fixtures.js";

// RÈGLE PRODUIT, fixée le 2026-09-08 : l'adresse e-mail est vérifiée UNE SEULE
// FOIS, à l'inscription. La connexion ne l'exige jamais.
//
// L'inscription est déjà bloquante sur la saisie du code reçu par e-mail
// (Register.jsx, étape « code », qui résiste même à un rechargement de page) :
// la vérification a donc bien lieu, au bon endroit. La réclamer de nouveau à
// chaque connexion n'ajoutait aucune sécurité — seulement le risque d'enfermer
// dehors un compte légitime le jour où un e-mail de confirmation se perd.
//
// Le parcours KYC, lui, reste conditionné à une adresse confirmée : c'est un
// parcours d'identité, pas un simple accès au compte.

const MOT_DE_PASSE = "unMotDePasseSolide123";

function requete(email, password) {
  const req = { body: { identifier: email, password }, ip: "203.0.113.5", headers: {}, get: () => undefined };
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

describe("Vérification de l'e-mail — uniquement à l'inscription", () => {
  const ORIGINAL_KYC = process.env.REQUIRE_EMAIL_VERIFICATION_KYC;

  beforeEach(() => { delete process.env.REQUIRE_EMAIL_VERIFICATION_KYC; });
  afterEach(() => {
    if (ORIGINAL_KYC === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION_KYC;
    else process.env.REQUIRE_EMAIL_VERIFICATION_KYC = ORIGINAL_KYC;
  });

  it("un compte dont l'e-mail n'est pas confirmé peut SE CONNECTER", async () => {
    const user = await createUser({
      email: "non-confirme@example.test",
      password: await bcrypt.hash(MOT_DE_PASSE, 10),
      emailVerified: false,
    });

    const { req, res } = requete(user.email, MOT_DE_PASSE);
    await login(req, res);

    expect(res.statusCode, "la connexion ne doit jamais exiger de vérification").toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("un compte confirmé se connecte normalement", async () => {
    const user = await createUser({
      email: "confirme@example.test",
      password: await bcrypt.hash(MOT_DE_PASSE, 10),
      emailVerified: true,
    });

    const { req, res } = requete(user.email, MOT_DE_PASSE);
    await login(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("aucune garde de vérification ne subsiste sur la connexion", () => {
    // Supprimée plutôt que neutralisée : une garde désactivée finit toujours
    // par être réactivée par mégarde. Ce test échoue si elle réapparaît.
    expect(module.emailVerificationRequiredForLogin).toBeUndefined();
    expect(module.EMAIL_VERIFICATION_CUTOFF).toBeUndefined();
  });

  it("le parcours KYC, lui, exige toujours une adresse confirmée", () => {
    expect(emailVerificationRequiredForKyc()).toBe(true);
  });

  it("le garde-fou KYC reste débrayable en cas de panne de délivrabilité", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_KYC = "false";
    expect(emailVerificationRequiredForKyc()).toBe(false);
  });
});
