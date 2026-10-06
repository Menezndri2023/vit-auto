import { describe, it, expect } from "vitest";
import { refusPublication } from "./refusPublication";

// Incident du 2026-10-05 : un partenaire dont la vérification d'identité était
// DÉJÀ en examen était renvoyé vers /kyc sans explication et croyait son
// annonce publiée. Le message doit dire ce qui se passe vraiment.
describe("refusPublication", () => {
  it("identité déjà envoyée : explique que l'examen est en cours, sans demander de la refaire", () => {
    const r = refusPublication({ code: "KYC_REQUIRED" }, { kycStatus: "A_REVOIR_MANUELLEMENT", kycSubmittedAt: "2026-10-05T20:49:49Z" });
    expect(r.message).toMatch(/en cours d'examen/);
    expect(r.message).toMatch(/n'a pas encore été publiée/);
    expect(r.lien).toBe("/kyc");
  });

  it("identité jamais envoyée : invite à la vérifier", () => {
    const r = refusPublication({ code: "KYC_REQUIRED" }, { kycStatus: "EN_ATTENTE", kycSubmittedAt: null });
    expect(r.message).toMatch(/vérifiez d'abord votre identité/);
  });

  it("identité refusée : invite à renvoyer les documents", () => {
    const r = refusPublication({ code: "KYC_REQUIRED" }, { kycStatus: "REFUSE", kycSubmittedAt: "2026-10-01T00:00:00Z" });
    expect(r.message).toMatch(/refusée/);
  });

  it("certification : mène au parcours léger, pas au portail Fondateur", () => {
    expect(refusPublication({ code: "CERTIFICATION_REQUIRED" }, {}).lien).toBe("/partner-certification");
  });

  it("erreur sans code de refus : rien (le message d'erreur habituel s'applique)", () => {
    expect(refusPublication({ message: "Erreur réseau" }, {})).toBeNull();
  });
});
