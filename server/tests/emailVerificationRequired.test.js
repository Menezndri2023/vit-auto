import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { emailVerificationRequiredForLogin, emailVerificationRequiredForKyc } from "../utils/emailVerificationRequired.js";

describe("emailVerificationRequired — flags découplés login vs KYC", () => {
  const ORIGINAL = { login: process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN, kyc: process.env.REQUIRE_EMAIL_VERIFICATION_KYC };

  beforeEach(() => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN;
    delete process.env.REQUIRE_EMAIL_VERIFICATION_KYC;
  });
  afterEach(() => {
    if (ORIGINAL.login === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN;
    else process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN = ORIGINAL.login;
    if (ORIGINAL.kyc === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION_KYC;
    else process.env.REQUIRE_EMAIL_VERIFICATION_KYC = ORIGINAL.kyc;
  });

  // Faille corrigée (audit sécurité 2026-09) : on pouvait s'inscrire avec
  // l'adresse d'un tiers non contrôlée et obtenir immédiatement une session
  // valide, sous l'identité e-mail de la victime — en squattant l'adresse au
  // passage. L'exigence ne peut cependant pas être rétroactive : des comptes
  // réels n'ont jamais confirmé leur adresse et se retrouveraient verrouillés.
  // D'où la bascule par DATE DE CRÉATION.
  it("n'est PAS exigé pour les comptes créés avant la bascule (pas de verrouillage rétroactif)", () => {
    const ancien = { createdAt: new Date("2026-01-15T10:00:00Z") };
    expect(emailVerificationRequiredForLogin(ancien)).toBe(false);
  });

  it("EST exigé pour les comptes créés après la bascule", () => {
    const nouveau = { createdAt: new Date("2026-12-01T10:00:00Z") };
    expect(emailVerificationRequiredForLogin(nouveau)).toBe(true);
  });

  it("sans date de création connue, ne verrouille pas (prudence)", () => {
    expect(emailVerificationRequiredForLogin(undefined)).toBe(false);
    expect(emailVerificationRequiredForLogin({})).toBe(false);
  });

  it("le drapeau à \"true\" étend l'exigence à TOUS les comptes", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN = "true";
    expect(emailVerificationRequiredForLogin({ createdAt: new Date("2020-01-01") })).toBe(true);
  });

  it("le drapeau à \"false\" la désactive partout (garde-fou délivrabilité)", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN = "false";
    expect(emailVerificationRequiredForLogin({ createdAt: new Date("2026-12-01") })).toBe(false);
  });

  it("KYC est bloquant par défaut", () => {
    expect(emailVerificationRequiredForKyc()).toBe(true);
  });

  it("KYC peut être désactivé explicitement (garde-fou déliverabilité SMTP)", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_KYC = "false";
    expect(emailVerificationRequiredForKyc()).toBe(false);
  });
});
