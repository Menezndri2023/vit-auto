import { describe, it, expect } from "vitest";
import { refusDePublication, autorisationProvisoireActive } from "../utils/publishingGate.js";

// Droit de publier — la règle qui existait en CINQ exemplaires (véhicule,
// chauffeur, activité de loisir, import de flotte, showroom) et n'était testée
// qu'à travers les contrôleurs qui la recopiaient. Une évolution appliquée à
// quatre d'entre eux laissait un trou dans le cinquième, sans qu'aucun test
// existant ne le montre.
//
// La partie neuve — l'autorisation provisoire — remplace une pratique franchement
// mauvaise : pour débloquer un partenaire non certifié, on lui posait
// `certificationBadge: "verifie"`, c'est-à-dire un badge « Partenaire Vérifié »
// affiché aux clients sans qu'aucune pièce ne le fonde. L'autorisation, elle,
// ouvre la publication SANS rien afficher, et expire d'elle-même.

const partenaire = (over = {}) => ({
  role: "partenaire",
  sellerType: "entreprise",
  certificationBadge: "none",
  kycStatus: "EN_ATTENTE",
  isFounder: false,
  provisionalPublishingUntil: null,
  ...over,
});

const dans = (jours) => new Date(Date.now() + jours * 86400000);

describe("Droit de publier — règles historiques", () => {
  it("laisse passer un client ou un admin : la règle ne les concerne pas", () => {
    expect(refusDePublication({ role: "client" })).toBeNull();
    expect(refusDePublication({ role: "admin" })).toBeNull();
    expect(refusDePublication(null)).toBeNull();
  });

  it("dispense le Founding Partner, vérifié à la signature", () => {
    expect(refusDePublication(partenaire({ isFounder: true }))).toBeNull();
  });

  it("exige le KYC d'un particulier, et rien de plus", () => {
    expect(refusDePublication(partenaire({ sellerType: "particulier" })).code).toBe("KYC_REQUIRED");
    expect(refusDePublication(partenaire({ sellerType: "particulier", kycStatus: "VERIFIE" }))).toBeNull();
  });

  it("exige la certification d'une entreprise ou d'un professionnel", () => {
    for (const t of ["entreprise", "professionnel", null]) {
      expect(refusDePublication(partenaire({ sellerType: t })).code, `sellerType=${t}`).toBe("CERTIFICATION_REQUIRED");
    }
    expect(refusDePublication(partenaire({ certificationBadge: "verifie" }))).toBeNull();
  });

  it("compose le message avec l'action demandée — c'est tout ce qui variait entre les cinq copies", () => {
    expect(refusDePublication(partenaire(), "importer une flotte").message).toMatch(/avant d'importer une flotte\.$/);
    expect(refusDePublication(partenaire(), "publier votre showroom").message).toMatch(/avant de publier votre showroom\.$/);
  });
});

describe("Droit de publier — autorisation provisoire", () => {
  it("ouvre la publication à une entreprise non certifiée, tant qu'elle court", () => {
    const u = partenaire({ provisionalPublishingUntil: dans(30) });
    expect(refusDePublication(u)).toBeNull();
  });

  it("se referme d'elle-même à l'échéance", () => {
    const u = partenaire({ provisionalPublishingUntil: dans(-1) });
    // Un oubli administratif doit refermer la porte, jamais la laisser ouverte.
    expect(refusDePublication(u).code).toBe("CERTIFICATION_REQUIRED");
  });

  it("ne dispense JAMAIS un particulier de sa vérification d'identité", () => {
    // Les deux ne pèsent pas le même risque : l'une atteste d'une entreprise,
    // l'autre de la personne physique responsable. Élargir l'autorisation au
    // KYC serait un contournement, pas une facilité.
    const u = partenaire({ sellerType: "particulier", provisionalPublishingUntil: dans(30) });
    expect(refusDePublication(u).code).toBe("KYC_REQUIRED");
  });

  it("une date absente ou nulle n'autorise rien", () => {
    expect(autorisationProvisoireActive(partenaire())).toBe(false);
    expect(autorisationProvisoireActive({})).toBe(false);
    expect(autorisationProvisoireActive(partenaire({ provisionalPublishingUntil: dans(1) }))).toBe(true);
  });

  it("est évaluée à l'instant donné, pas à l'import du module", () => {
    const u = partenaire({ provisionalPublishingUntil: dans(10) });
    expect(refusDePublication(u, "publier une annonce", dans(20)).code).toBe("CERTIFICATION_REQUIRED");
    expect(refusDePublication(u, "publier une annonce", dans(5))).toBeNull();
  });
});
