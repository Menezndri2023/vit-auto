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
// ouvre la publication SANS rien afficher.
//
// Elle porte deux champs distincts, `granted` et `until`, et cette séparation
// est l'objet de la moitié des cas ci-dessous : l'octroi et son échéance sont
// deux décisions différentes. Une autorisation sans échéance (`until: null`)
// court jusqu'à un retrait explicite — c'est le régime choisi par l'exploitant,
// qui veut que le retrait soit une décision tracée et non l'effet d'un
// calendrier. Une autorisation datée, elle, se referme toute seule.

const partenaire = (over = {}) => ({
  role: "partenaire",
  sellerType: "entreprise",
  certificationBadge: "none",
  kycStatus: "EN_ATTENTE",
  isFounder: false,
  provisionalPublishing: { granted: false, until: null },
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
    const u = partenaire({ provisionalPublishing: { granted: true, until: dans(30) } });
    expect(refusDePublication(u)).toBeNull();
  });

  it("se referme d'elle-même à l'échéance", () => {
    const u = partenaire({ provisionalPublishing: { granted: true, until: dans(-1) } });
    // Un oubli administratif doit refermer la porte, jamais la laisser ouverte.
    expect(refusDePublication(u).code).toBe("CERTIFICATION_REQUIRED");
  });

  it("ne dispense JAMAIS un particulier de sa vérification d'identité", () => {
    // Les deux ne pèsent pas le même risque : l'une atteste d'une entreprise,
    // l'autre de la personne physique responsable. Élargir l'autorisation au
    // KYC serait un contournement, pas une facilité.
    const u = partenaire({ sellerType: "particulier", provisionalPublishing: { granted: true, until: dans(30) } });
    expect(refusDePublication(u).code).toBe("KYC_REQUIRED");
  });

  it("court SANS ÉCHÉANCE quand aucune date n'est fixée", () => {
    // C'est le cas voulu par l'exploitant : le retrait doit être une décision
    // tracée, pas l'effet d'un calendrier. Une date absente ne referme donc
    // rien — à la différence de la première version, où « pas de date »
    // valait « pas d'autorisation ».
    const u = partenaire({ provisionalPublishing: { granted: true, until: null } });
    expect(autorisationProvisoireActive(u)).toBe(true);
    expect(refusDePublication(u)).toBeNull();
    // Et elle tient encore dans dix ans.
    expect(autorisationProvisoireActive(u, dans(3650))).toBe(true);
  });

  it("n'autorise rien tant que l'octroi n'est pas posé, même avec une date", () => {
    // `granted` porte la décision, `until` seulement sa fin : une date seule ne
    // vaut pas autorisation.
    expect(autorisationProvisoireActive(partenaire())).toBe(false);
    expect(autorisationProvisoireActive({})).toBe(false);
    expect(autorisationProvisoireActive(partenaire({ provisionalPublishing: { granted: false, until: dans(30) } }))).toBe(false);
    expect(autorisationProvisoireActive(partenaire({ provisionalPublishing: { granted: true, until: dans(1) } }))).toBe(true);
  });

  it("est évaluée à l'instant donné, pas à l'import du module", () => {
    const u = partenaire({ provisionalPublishing: { granted: true, until: dans(10) } });
    expect(refusDePublication(u, "publier une annonce", dans(20)).code).toBe("CERTIFICATION_REQUIRED");
    expect(refusDePublication(u, "publier une annonce", dans(5))).toBeNull();
  });
});
