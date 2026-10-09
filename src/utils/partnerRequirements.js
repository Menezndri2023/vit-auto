// Miroir frontend de server/utils/partnerRequirements.js — mêmes règles, pour
// que Register.jsx calcule la redirection post-inscription sans aller-retour
// serveur supplémentaire. Toute évolution des règles doit être répercutée des
// deux côtés (pas de dossier partagé entre server/ et src/ dans ce repo).
import { requiresDriverDocs, requiresBusinessDocs } from "../constants/partnerTaxonomy.js";

const BUSINESS_DOCS = ["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"];
// Chauffeur : permis + CV, rien d'autre (règle de l'exploitant, 2026-10-09 —
// voir server/services/validationPartenaire.js, qui décide de la validation).
const DRIVER_DOCS = ["cv", "driverLicense"];

export function resolveRequirements({ activity, entityType }) {
  const driverRequired = requiresDriverDocs(activity);
  const businessRequired = requiresBusinessDocs(entityType);

  let postRegistrationRedirect = "/kyc";
  // Le chauffeur dépose son permis et son CV dans le formulaire de sa fiche :
  // aucun passage préalable par la vérification d'identité.
  if (driverRequired) postRegistrationRedirect = "/vendor?type=chauffeur";
  else if (businessRequired) postRegistrationRedirect = "/kyc?next=partner-onboarding";

  return {
    kyc: { required: !driverRequired, docs: driverRequired ? [] : ["identity"] },
    driver: { required: driverRequired, docs: driverRequired ? DRIVER_DOCS : [] },
    business: { required: businessRequired, docs: businessRequired ? BUSINESS_DOCS : [] },
    postRegistrationRedirect,
  };
}
