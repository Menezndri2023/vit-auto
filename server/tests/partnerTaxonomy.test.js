import { describe, it, expect } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  ACTIVITY_TO_PARTNER_TYPE,
  ACTIVITY_TO_COMPANY_TYPE,
  ENTITY_TYPES,
  entityTypeToSellerType,
  requiresDriverDocs,
  requiresBusinessDocs,
} from "../constants/partnerTaxonomy.js";
import User from "../models/User.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerVerification from "../models/PartnerVerification.js";
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

  it("ACTIVITIES/ENTITY_TYPES exposent bien les valeurs attendues", () => {
    // "loisirs" (plongée, quad, jetski…) : la plateforme savait modéliser et
    // réserver ces activités bien avant que la taxonomie sache les nommer.
    expect(ACTIVITIES).toEqual(["loueur", "vendeur", "exportateur", "chauffeur", "loisirs"]);
    expect(ENTITY_TYPES).toEqual(["particulier", "professionnel", "entreprise", "concessionnaire"]);
  });

  // Ce test vaut plus que la liste elle-même : ajouter une activité sans la
  // mapper laisse un compte partenaire à moitié typé, et le défaut ne se voit
  // qu'au moment où un dossier d'onboarding échoue à la validation Mongoose.
  it("chaque activité a un libellé et un mapping vers les deux enums historiques", () => {
    for (const a of ACTIVITIES) {
      expect(ACTIVITY_LABELS[a], `libellé manquant pour "${a}"`).toBeTruthy();
      expect(ACTIVITY_TO_PARTNER_TYPE[a], `partnerType manquant pour "${a}"`).toBeTruthy();
      expect(ACTIVITY_TO_COMPANY_TYPE[a], `companyType manquant pour "${a}"`).toBeTruthy();
    }
  });

  it("les cibles du mapping existent RÉELLEMENT dans les enums des modèles", () => {
    // Un mapping vers une valeur absente de l'enum passe tous les tests
    // unitaires et n'échoue qu'à l'écriture en base, chez un vrai partenaire.
    const partnerTypeEnum = PartnerOnboarding.schema.path("partnerType").enumValues;
    const companyTypeEnum = PartnerVerification.schema.path("companyType").enumValues;
    for (const a of ACTIVITIES) {
      expect(partnerTypeEnum, `partnerType "${ACTIVITY_TO_PARTNER_TYPE[a]}" (${a}) absent de l'enum`)
        .toContain(ACTIVITY_TO_PARTNER_TYPE[a]);
      expect(companyTypeEnum, `companyType "${ACTIVITY_TO_COMPANY_TYPE[a]}" (${a}) absent de l'enum`)
        .toContain(ACTIVITY_TO_COMPANY_TYPE[a]);
    }
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

  // La chaîne complète entityType -> sellerType -> partnerCategory, en un seul
  // enregistrement. C'est le parcours d'inscription partenaire d'AUJOURD'HUI :
  // il ne fournit qu'entityType. Les deux dérivations étaient écrites dans le
  // mauvais ordre, si bien que partnerCategory restait null — un compte à
  // moitié typé, invisible tant qu'on ne regardait que sellerType.
  it("dérive partnerCategory jusqu'au bout quand SEUL entityType est fourni", async () => {
    const user = await createUser({ role: "partenaire", entityType: "entreprise", sellerType: null, partnerCategory: null });
    expect(user.sellerType).toBe("entreprise");
    expect(user.partnerCategory, "la seconde dérivation doit voir le sellerType tout juste calculé").toBe("entreprise");
  });

  it("dérive aussi la catégorie pour un concessionnaire (entreprise côté sellerType)", async () => {
    const user = await createUser({ role: "partenaire", entityType: "concessionnaire", sellerType: null, partnerCategory: null });
    expect(user.sellerType).toBe("entreprise");
    expect(user.partnerCategory).toBe("entreprise");
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
