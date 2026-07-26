// Miroir frontend de server/utils/partnerRequirements.js — mêmes règles, pour
// que Register.jsx calcule la redirection post-inscription sans aller-retour
// serveur supplémentaire. Toute évolution des règles doit être répercutée des
// deux côtés (pas de dossier partagé entre server/ et src/ dans ce repo).
import { requiresDriverDocs, requiresBusinessDocs } from "../constants/partnerTaxonomy.js";

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
