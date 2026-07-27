import { describe, it, expect } from "vitest";
import { generateLOI, generateAgreement } from "../controllers/partnerOnboardingController.js";
import { createUser } from "./helpers/fixtures.js";

// Bug réel trouvé en audit : applyToProgram ne renseigne jamais `partnerType`
// à la création du dossier (seuls `activity`/`legalEntityType` le sont), et la
// carte "Type de partenaire" dans l'assistant (StepTypeInfo.jsx) n'est PAS
// marquée requise contrairement à "Activité" — un partenaire ayant choisi son
// activité (ex. Chauffeur, Exportateur) sans jamais cliquer une carte "Type de
// partenaire" se retrouvait donc avec le partnerType par défaut du schéma
// ("concessionnaire") figé dans sa LOI/son Accord signés, quelle que soit son
// activité réelle. Ces tests vérifient que le document légal généré reflète
// bien l'activité choisie, pas un défaut jamais choisi par l'utilisateur.
const date = "26 juillet 2026";

describe("generateLOI / generateAgreement — correspondance avec les champs choisis", () => {
  it("un partenaire ayant choisi l'activité 'chauffeur' voit 'Professional Driver' dans sa LOI, pas 'Dealer/Concessionnaire' (partnerType jamais choisi explicitement)", async () => {
    const user = await createUser({ role: "partenaire", firstName: "Awa", lastName: "Koné" });
    const doc = {
      referenceNumber: "VA-FP-2026-TEST1",
      activity: "chauffeur",
      // partnerType volontairement absent (comme un vrai document Mongoose non
      // hydraté ici) — un document réel aurait la valeur par défaut du schéma
      // "concessionnaire", jamais choisie par l'utilisateur.
      partnerType: "concessionnaire",
      legalEntityType: "particulier",
      companyInfo: { legalName: "Awa Koné" },
      commissions: {},
    };
    const loi = await generateLOI(doc, user, date);
    expect(loi).toContain("Professional Driver");
    expect(loi).not.toContain("Dealer / Concessionnaire");
  });

  it("même correspondance dans l'Accord de Partenariat Fondateur", async () => {
    const user = await createUser({ role: "partenaire", firstName: "Ibrahim", lastName: "Traoré" });
    const doc = {
      referenceNumber: "VA-FP-2026-TEST2",
      activity: "exportateur",
      partnerType: "concessionnaire",
      legalEntityType: "entreprise",
      companyInfo: { legalName: "Traoré Export SARL", registrationCountry: "Côte d'Ivoire" },
      commissions: {},
    };
    const agreement = await generateAgreement(doc, user, date);
    expect(agreement).toContain("Importer & Exporter");
    expect(agreement).not.toContain("Partner type: Dealer");
  });

  it("une catégorie spécialisée sans équivalent dans les 4 activités (ex: assurance) garde le partnerType choisi explicitement", async () => {
    const user = await createUser({ role: "partenaire" });
    const doc = {
      referenceNumber: "VA-FP-2026-TEST3",
      activity: null, // pas d'activité — catégorie spécialisée, choisie via la carte "Type de partenaire"
      partnerType: "assurance",
      legalEntityType: "entreprise",
      companyInfo: { legalName: "AssurAuto SARL" },
      commissions: {},
    };
    const loi = await generateLOI(doc, user, date);
    expect(loi).toContain("Insurance Partner");
  });

  it("pour un particulier, le pays affiché retombe sur doc.country quand registrationCountry n'a jamais été collecté", async () => {
    const user = await createUser({ role: "partenaire" });
    const doc = {
      referenceNumber: "VA-FP-2026-TEST4",
      activity: "loueur",
      partnerType: "concessionnaire",
      legalEntityType: "particulier",
      country: "CI", // dénormalisé depuis User.country à la candidature
      companyInfo: { legalName: "Jean Particulier" }, // registrationCountry jamais rempli (champ caché pour un particulier)
      commissions: {},
    };
    const loi = await generateLOI(doc, user, date);
    expect(loi).toContain("Country of Registration: CI");
    expect(loi).not.toContain("Country of Registration: —");
  });
});
