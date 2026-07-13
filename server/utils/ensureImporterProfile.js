import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";

// ── Auto-provisionnement du profil importateur pour les Founding Partners ────
// Avant ceci, publier une annonce Import/Export exigeait une candidature
// "Importateur" séparée (via /importer-apply, statut ImporterPartnerProfile),
// distincte du Founding Partner Program — deux vérifications indépendantes
// pour un même partenaire. Le Founding Partner Program (KYC + entreprise +
// représentant + véhicules + export déjà collectés à la signature de l'Accord)
// est la vérification la plus rigoureuse du site : elle vaut désormais
// vérification complète pour publier en export, sans candidature séparée.
//
// On garde le modèle ImporterPartnerProfile tel quel (badge, admin, affichage
// public des annonces) pour ne rien casser en aval — on se contente de le
// créer automatiquement, déjà "verified", à partir du dossier Founding Partner
// signé, la première fois qu'un Founding Partner accède à l'Import/Export.
export async function ensureImporterProfile(user) {
  if (!user?.isFounder) return null;

  let profile = await ImporterPartnerProfile.findOne({ userId: user._id });
  if (profile) return profile;

  const onboarding = await PartnerOnboarding.findOne({ userId: user._id }).lean();

  profile = await ImporterPartnerProfile.create({
    userId:       user._id,
    companyName:  onboarding?.companyInfo?.legalName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Founding Partner",
    address:      onboarding?.companyInfo?.address || "",
    city:         "",
    country:      onboarding?.companyInfo?.registrationCountry || "",
    website:      onboarding?.companyInfo?.website || "",
    activityType: ["import", "export"],
    status:       "verified",
    badgeLevel:   "gold",
    submittedAt:  new Date(),
    reviewedAt:   new Date(),
  });

  return profile;
}
