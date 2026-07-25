// Taxonomie canonique du partenariat : activité × type d'entité. Dupliqué à
// l'identique dans src/constants/partnerTaxonomy.js (pas de dossier partagé
// entre server/ et src/ dans ce repo — voir server/constants/incoterms.js).
//
// Remplace progressivement les enums historiques éclatés (User.sellerType,
// User.partnerCategory, PartnerOnboarding.partnerType/legalEntityType,
// PartnerVerification.companyType, ImporterPartnerProfile.activityType) sans
// les supprimer : ce module fournit les fonctions de correspondance vers ces
// anciens champs pour que le code existant continue de fonctionner pendant la
// migration progressive.

export const ACTIVITIES = ["loueur", "vendeur", "exportateur", "chauffeur"];

export const ENTITY_TYPES = ["particulier", "professionnel", "entreprise", "concessionnaire"];

export const ACTIVITY_LABELS = {
  loueur: "Loueur — je mets des véhicules en location",
  vendeur: "Vendeur — je vends des véhicules",
  exportateur: "Exportateur — import/export de véhicules",
  chauffeur: "Chauffeur — je propose mes services de conduite",
};

export const ENTITY_TYPE_LABELS = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  entreprise: "Entreprise",
  concessionnaire: "Concessionnaire",
};

// entityType -> User.sellerType historique : "concessionnaire" n'a pas
// d'équivalent direct, il porte la même charge documentaire qu'"entreprise".
export function entityTypeToSellerType(entityType) {
  if (entityType === "concessionnaire") return "entreprise";
  return ["particulier", "professionnel", "entreprise"].includes(entityType) ? entityType : null;
}

// activity -> PartnerOnboarding.partnerType historique (utilisé pour seeder
// les anciens champs, et par le script de migration pour le mapping inverse).
export const ACTIVITY_TO_PARTNER_TYPE = {
  loueur: "agence_location",
  vendeur: "concessionnaire",
  exportateur: "importateur_exportateur",
  chauffeur: "chauffeur_professionnel",
};

// activity -> PartnerVerification.companyType historique. "chauffeur" n'a pas
// d'équivalent dans cet enum (la vérification chauffeur passe entièrement par
// User.identity/driverLicenseOcr, pas par PartnerVerification) — "autre" est
// un repli acceptable, jamais lu pour la logique de gating chauffeur.
export const ACTIVITY_TO_COMPANY_TYPE = {
  loueur: "loueur",
  vendeur: "concessionnaire",
  exportateur: "exportateur",
  chauffeur: "autre",
};

export function requiresDriverDocs(activity) {
  return activity === "chauffeur";
}

export function requiresBusinessDocs(entityType) {
  return ["professionnel", "entreprise", "concessionnaire"].includes(entityType);
}
