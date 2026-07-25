import { describe, it, expect } from "vitest";
import {
  ACTIVITIES,
  ENTITY_TYPES,
  entityTypeToSellerType,
  requiresDriverDocs,
  requiresBusinessDocs,
} from "../constants/partnerTaxonomy.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";

describe("partnerTaxonomy — mapping vers les anciens champs", () => {
  it("mappe chaque entityType vers le sellerType historique attendu", () => {
    expect(entityTypeToSellerType("particulier")).toBe("particulier");
    expect(entityTypeToSellerType("professionnel")).toBe("professionnel");
    expect(entityTypeToSellerType("entreprise")).toBe("entreprise");
    expect(entityTypeToSellerType("concessionnaire")).toBe("entreprise");
    expect(entityTypeToSellerType(null)).toBe(null);
  });

  it("requiresDriverDocs n'est vrai que pour l'activité chauffeur", () => {
    expect(requiresDriverDocs("chauffeur")).toBe(true);
    for (const a of ACTIVITIES.filter((x) => x !== "chauffeur")) {
      expect(requiresDriverDocs(a)).toBe(false);
    }
  });

  it("requiresBusinessDocs est vrai pour professionnel/entreprise/concessionnaire, faux pour particulier", () => {
    expect(requiresBusinessDocs("particulier")).toBe(false);
    expect(requiresBusinessDocs("professionnel")).toBe(true);
    expect(requiresBusinessDocs("entreprise")).toBe(true);
    expect(requiresBusinessDocs("concessionnaire")).toBe(true);
  });

  it("ACTIVITIES/ENTITY_TYPES exposent bien les 4 valeurs attendues", () => {
    expect(ACTIVITIES).toEqual(["loueur", "vendeur", "exportateur", "chauffeur"]);
    expect(ENTITY_TYPES).toEqual(["particulier", "professionnel", "entreprise", "concessionnaire"]);
  });
});

describe("User — backfill sellerType depuis entityType (hook pre-validate)", () => {
  it("dérive sellerType quand entityType est fourni sans sellerType", async () => {
    const user = await createUser({ role: "partenaire", entityType: "professionnel", sellerType: null });
    expect(user.sellerType).toBe("professionnel");
  });

  it("mappe concessionnaire vers sellerType=entreprise", async () => {
    const user = await createUser({ role: "partenaire", entityType: "concessionnaire", sellerType: null });
    expect(user.sellerType).toBe("entreprise");
  });

  it("ne jamais écraser un sellerType déjà explicitement renseigné", async () => {
    const user = await createUser({ role: "partenaire", entityType: "entreprise", sellerType: "particulier" });
    expect(user.sellerType).toBe("particulier");
  });

  it("laisse sellerType à null si aucun entityType n'est fourni (comptes existants)", async () => {
    const user = await createUser({ role: "partenaire" });
    expect(user.sellerType).toBe(null);
    expect(user.entityType).toBe(null);
  });

  it("le hook existant partnerCategory <- sellerType continue de fonctionner (non-régression)", async () => {
    const user = await createUser({ role: "partenaire", sellerType: "professionnel" });
    expect(user.partnerCategory).toBe("professionnel");
  });

  it("rejette une valeur d'entityType hors enum", async () => {
    await expect(
      User.create({
        firstName: "Test", lastName: "Invalid", email: "invalid-entity@example.test",
        password: "x", role: "partenaire", entityType: "not-a-real-type",
      })
    ).rejects.toThrow();
  });
});
