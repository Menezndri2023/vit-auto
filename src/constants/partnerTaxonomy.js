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

// "loisirs" couvre les partenaires qui vendent une EXPÉRIENCE et non un
// véhicule : plongée, quad, jetski, montgolfière, karting… (voir
// constants/activityTypes.js et models/Activity.js). La plateforme savait
// depuis longtemps modéliser, publier et réserver ces activités — la rubrique
// « Loisirs » du catalogue et la page /vendor/submit-activity existaient — mais
// l'activité manquait ICI : un centre de plongée ne pouvait pas déclarer son
// métier à l'inscription, et son compte restait typé `null` ou, pire, "loueur".
export const ACTIVITIES = ["loueur", "vendeur", "exportateur", "chauffeur", "loisirs"];

export const ENTITY_TYPES = ["particulier", "professionnel", "entreprise", "concessionnaire"];

export const ACTIVITY_LABELS = {
  loueur: "Loueur — je mets des véhicules en location",
  vendeur: "Vendeur — je vends des véhicules",
  exportateur: "Exportateur — import/export de véhicules",
  chauffeur: "Chauffeur — je propose mes services de conduite",
  loisirs: "Activités & loisirs — plongée, quad, jetski, excursions…",
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
  loisirs: "activites_loisirs",
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
  // Même cas que "chauffeur" : l'enum historique de PartnerVerification ne
  // connaît que des métiers automobiles. "autre" est le repli prévu pour ça,
  // il n'est lu par aucune logique de gating.
  loisirs: "autre",
};

export function requiresDriverDocs(activity) {
  return activity === "chauffeur";
}

export function requiresBusinessDocs(entityType) {
  return ["professionnel", "entreprise", "concessionnaire"].includes(entityType);
}

// Secteurs d'un compte partenaire : celui de l'inscription (`partnerActivity`,
// exposé `activity` par safeUser) + ceux ajoutés depuis le dashboard. Vide =
// compte historique sans secteur déclaré (on ne cache alors rien).
export const secteursDuPartenaire = (user) => {
  const s = new Set([user?.partnerActivity || user?.activity, ...(user?.partnerActivities || [])].filter(Boolean));
  return [...s];
};

// « Le secteur activités & loisirs n'inclut pas de chauffeur » (précision de
// l'exploitant, 2026-09-14) : un partenaire dont le seul secteur est
// « loisirs » ne voit ni véhicules ni chauffeurs dans son espace — ses
// annonces sont des activités.
export const estUniquementLoisirs = (user) => {
  const s = secteursDuPartenaire(user);
  return s.length > 0 && s.every((a) => a === "loisirs");
};
