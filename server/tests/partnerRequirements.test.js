import { describe, it, expect } from "vitest";
import { resolveRequirements } from "../utils/partnerRequirements.js";
import { ACTIVITIES, ENTITY_TYPES } from "../constants/partnerTaxonomy.js";

describe("resolveRequirements", () => {
  it("exige toujours le KYC identité, quel que soit le profil", () => {
    for (const activity of ACTIVITIES) {
      for (const entityType of ENTITY_TYPES) {
        const req = resolveRequirements({ activity, entityType });
        expect(req.kyc).toEqual({ required: true, docs: ["identity"] });
      }
    }
  });

  it("particulier loueur/vendeur/exportateur : ni documents chauffeur ni documents d'entreprise, redirection /kyc seul", () => {
    for (const activity of ["loueur", "vendeur", "exportateur"]) {
      const req = resolveRequirements({ activity, entityType: "particulier" });
      expect(req.driver.required).toBe(false);
      expect(req.business.required).toBe(false);
      expect(req.postRegistrationRedirect).toBe("/kyc");
    }
  });

  it("chauffeur (quel que soit entityType) exige les documents chauffeur et redirige vers next=driver-docs", () => {
    for (const entityType of ENTITY_TYPES) {
      const req = resolveRequirements({ activity: "chauffeur", entityType });
      expect(req.driver.required).toBe(true);
      expect(req.driver.docs).toEqual(["cv", "identity", "driverLicense"]);
      expect(req.postRegistrationRedirect).toBe("/kyc?next=driver-docs");
    }
  });

  it("professionnel/entreprise/concessionnaire (non-chauffeur) exigent les documents d'entreprise et redirigent vers next=partner-onboarding", () => {
    for (const entityType of ["professionnel", "entreprise", "concessionnaire"]) {
      for (const activity of ["loueur", "vendeur", "exportateur"]) {
        const req = resolveRequirements({ activity, entityType });
        expect(req.business.required).toBe(true);
        expect(req.business.docs).toEqual(["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"]);
        expect(req.postRegistrationRedirect).toBe("/kyc?next=partner-onboarding");
      }
    }
  });

  it("un chauffeur professionnel/entreprise priorise la redirection driver-docs (le chauffeur passe d'abord par ses docs propres)", () => {
    const req = resolveRequirements({ activity: "chauffeur", entityType: "entreprise" });
    expect(req.driver.required).toBe(true);
    expect(req.business.required).toBe(true);
    expect(req.postRegistrationRedirect).toBe("/kyc?next=driver-docs");
  });
});
