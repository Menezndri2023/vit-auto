import PartnerBusiness from "../models/PartnerBusiness.js";

// Résout l'entité (PartnerBusiness) par défaut d'un partenaire, ou en crée une
// minimale si aucune n'existe — pour que le Founding Partner Program (désormais
// PAR ENTITÉ, voir PartnerOnboarding.businessId) puisse toujours rattacher un
// dossier à une entité réelle, même pour un partenaire "particulier" qui n'en a
// jamais explicitement créé une. Réutilisé par partnerOnboardingController.js
// (applyToProgram) et par server/scripts/migratePartnerOnboardingToBusinessId.js
// (avec un `seed` tiré du dossier d'onboarding existant, plus riche que les
// champs User bruts).
export async function ensureDefaultPartnerBusiness(user, seed = {}) {
  const existing = await PartnerBusiness.findOne({ owner: user._id, isDefault: true })
    || await PartnerBusiness.findOne({ owner: user._id }).sort({ createdAt: 1 });
  if (existing) return existing;

  const companyName = seed.companyName
    || user.business?.companyName
    || `${user.firstName || ""} ${user.lastName || ""}`.trim()
    || "Partenaire VIT AUTO";

  // country est obligatoire sur PartnerBusiness — repli sur "CI" (siège de
  // référence du projet) uniquement si ni le dossier ni le compte n'ont de
  // pays renseigné (comptes très anciens, avant l'ajout de User.country).
  const country = seed.country || user.country || "CI";
  const ville   = seed.ville   || "—";
  const adresse = seed.adresse || null;

  return PartnerBusiness.create({
    owner: user._id,
    companyName,
    country,
    ville,
    adresse,
    isDefault: true,
  });
}

// Variante lecture seule (ne crée rien) — utilisée quand un appelant a besoin
// de retrouver le dossier Founding Partner "par défaut" d'un utilisateur sans
// businessId explicite dans la requête (ex: importExportController.createListing,
// où le choix d'une entité reste optionnel côté formulaire).
export async function resolveDefaultPartnerBusinessId(userId) {
  const business = await PartnerBusiness.findOne({ owner: userId, isDefault: true })
    || await PartnerBusiness.findOne({ owner: userId }).sort({ createdAt: 1 });
  return business?._id || null;
}
