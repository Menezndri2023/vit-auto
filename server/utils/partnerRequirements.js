// Résolveur unique des exigences documentaires par {activity, entityType}.
// Point de vérité unique consommé par : la redirection post-inscription
// (authController.js/Register.jsx), le gating de publication chauffeur
// (driverController.js missingDriverDocs) et l'étape StepDocuments du wizard
// Founding Partner (PartnerOnboardingPortal.jsx) — pour ne jamais avoir trois
// implémentations séparées de la même règle "quels documents sont requis".
import { requiresDriverDocs, requiresBusinessDocs } from "../constants/partnerTaxonomy.js";

// Documents d'entité déjà modélisés dans PartnerOnboarding.legalDocs — la
// liste ici sert d'affichage/validation, pas de nouveau schéma.
const BUSINESS_DOCS = ["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"];
const DRIVER_DOCS = ["cv", "identity", "driverLicense"];

export function resolveRequirements({ activity, entityType }) {
  const driverRequired = requiresDriverDocs(activity);
  const businessRequired = requiresBusinessDocs(entityType);

  let postRegistrationRedirect = "/kyc";
  if (driverRequired) postRegistrationRedirect = "/kyc?next=driver-docs";
  else if (businessRequired) postRegistrationRedirect = "/kyc?next=partner-onboarding";

  return {
    kyc: { required: true, docs: ["identity"] },
    driver: { required: driverRequired, docs: driverRequired ? DRIVER_DOCS : [] },
    business: { required: businessRequired, docs: businessRequired ? BUSINESS_DOCS : [] },
    postRegistrationRedirect,
  };
}
