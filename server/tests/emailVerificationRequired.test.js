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

  it("login reste NON bloquant par défaut (comptes existants non vérifiés ne doivent pas être verrouillés)", () => {
    expect(emailVerificationRequiredForLogin()).toBe(false);
  });

  it("login devient bloquant seulement si explicitement activé", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN = "true";
    expect(emailVerificationRequiredForLogin()).toBe(true);
  });

  it("KYC est bloquant par défaut", () => {
    expect(emailVerificationRequiredForKyc()).toBe(true);
  });

  it("KYC peut être désactivé explicitement (garde-fou déliverabilité SMTP)", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_KYC = "false";
    expect(emailVerificationRequiredForKyc()).toBe(false);
  });
});
