import { describe, it, expect } from "vitest";
import {
  migratePartnerOnboardingRecords,
  reverseActivityFromPartnerType,
} from "../scripts/migratePartnerOnboardingToBusinessId.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser } from "./helpers/fixtures.js";

// Ces tests créent des PartnerOnboarding "à l'ancienne" (businessId absent) en
// contournant Mongoose (collection brute) pour simuler fidèlement l'état
// pré-migration — passer businessId explicitement via le modèle appliquerait
// son `default: null`, ce qui est déjà le cas ; le point important ici est
// bien l'ABSENCE du champ, comme en base réelle avant ce changement.
async function createLegacyOnboarding(userId, overrides = {}) {
  const doc = await PartnerOnboarding.create({ userId, ...overrides });
  // Retire explicitement businessId pour simuler un document jamais migré
  // (le `default: null` du schéma le poserait sinon automatiquement à la création).
  await PartnerOnboarding.collection.updateOne({ _id: doc._id }, { $unset: { businessId: "" } });
  return doc._id;
}

describe("reverseActivityFromPartnerType", () => {
  it("mappe les 4 partnerType connus vers leur activité", () => {
    expect(reverseActivityFromPartnerType("agence_location")).toBe("loueur");
    expect(reverseActivityFromPartnerType("concessionnaire")).toBe("vendeur");
    expect(reverseActivityFromPartnerType("importateur_exportateur")).toBe("exportateur");
    expect(reverseActivityFromPartnerType("chauffeur_professionnel")).toBe("chauffeur");
  });

  it("renvoie null pour un partnerType hérité sans équivalent", () => {
    for (const legacy of ["expert_auto", "financement", "assurance", "inspecteur_vehicles", "transitaire_logistique"]) {
      expect(reverseActivityFromPartnerType(legacy)).toBe(null);
    }
  });
});

describe("migratePartnerOnboardingRecords", () => {
  it("dry-run : ne modifie rien et ne crée aucune PartnerBusiness", async () => {
    const user = await createUser({ role: "partenaire" });
    const docId = await createLegacyOnboarding(user._id, { partnerType: "agence_location" });

    const report = await migratePartnerOnboardingRecords({ dryRun: true });

    expect(report.total).toBeGreaterThanOrEqual(1);
    expect(report.migrated).toBeGreaterThanOrEqual(1);
    const doc = await PartnerOnboarding.findById(docId).lean();
    expect(doc.businessId).toBeUndefined();
    const businesses = await PartnerBusiness.countDocuments({ owner: user._id });
    expect(businesses).toBe(0);
  });

  it("execute : rattache le dossier à une PartnerBusiness créée et déduit l'activité", async () => {
    const user = await createUser({ role: "partenaire", country: "CI" });
    const docId = await createLegacyOnboarding(user._id, {
      partnerType: "chauffeur_professionnel",
      companyInfo: { legalName: "Transport Fiable SARL", registrationCountry: "CI" },
    });

    const report = await migratePartnerOnboardingRecords({ dryRun: false });
    expect(report.migrated).toBeGreaterThanOrEqual(1);

    const doc = await PartnerOnboarding.findById(docId).populate("businessId");
    expect(doc.businessId).toBeTruthy();
    expect(doc.businessId.companyName).toBe("Transport Fiable SARL");
    expect(doc.activity).toBe("chauffeur");
  });

  it("execute : réutilise une PartnerBusiness existante plutôt que d'en créer une seconde", async () => {
    const user = await createUser({ role: "partenaire", country: "CI" });
    const existingBusiness = await PartnerBusiness.create({
      owner: user._id, companyName: "Déjà Là SARL", country: "CI", ville: "Abidjan", isDefault: true,
    });
    const docId = await createLegacyOnboarding(user._id, { partnerType: "concessionnaire" });

    await migratePartnerOnboardingRecords({ dryRun: false });

    const doc = await PartnerOnboarding.findById(docId);
    expect(String(doc.businessId)).toBe(String(existingBusiness._id));
    const count = await PartnerBusiness.countDocuments({ owner: user._id });
    expect(count).toBe(1);
  });

  it("laisse activity=null et journalise un partnerType hérité ambigu, sans bloquer la migration", async () => {
    const user = await createUser({ role: "partenaire", country: "CI" });
    const docId = await createLegacyOnboarding(user._id, { partnerType: "expert_auto" });

    const report = await migratePartnerOnboardingRecords({ dryRun: false });

    expect(report.ambiguousActivity.some((a) => a.id === String(docId))).toBe(true);
    const doc = await PartnerOnboarding.findById(docId);
    expect(doc.activity).toBe(null);
    expect(doc.businessId).toBeTruthy();
  });
});
