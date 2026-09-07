import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import Driver from "../models/Driver.js";
import logger from "./logger.js";

// Dépublie en masse toutes les annonces actives d'un partenaire — à appeler
// quand son dossier de vérification/KYC passe à un statut qui ne l'autorise
// plus à publier (suspendu/rejeté/refusé, voir partnerVerificationController
// .adminUpdateStatus et kycController.adminReviewKyc). Sans ça, ses annonces
// déjà approuvées restaient visibles et réservables indéfiniment malgré la
// suspension — bug réel trouvé en audit. Réversible : available/status
// repassent à leur valeur normale à la prochaine action du partenaire, jamais
// de suppression.
//
// Bug réel corrigé (audit) : les profils chauffeur n'étaient jamais inclus
// ici — un chauffeur publié par un partenaire suspendu/rejeté restait visible
// et réservable publiquement (getDrivers ne filtre que status:"approved",
// sans jamais revérifier PartnerVerification). Repassé à "pending" plutôt
// qu'un nouveau statut : remet le profil dans la file de revue admin, geste
// déjà nécessaire pour qu'un partenaire réintégré retrouve un dossier propre.
export async function unpublishPartnerListings(partnerId) {
  try {
    await Promise.all([
      // `available` seul ne suffisait pas : il est intégralement RECALCULÉ à
      // partir de l'occupation par syncAllAvailability/getVehicleAvailability
      // (vehicleController.js) — un simple passage de la synchro republiait
      // donc les annonces d'un partenaire dont le KYC venait d'être refusé.
      // Le statut, lui, fait foi et remet l'annonce dans la file de revue
      // admin, exactement comme pour les profils chauffeur ci-dessous.
      Vehicle.updateMany({ owner: partnerId, status: "approved" }, { $set: { status: "pending", available: false } }),
      ImportExportListing.updateMany({ partner: partnerId, status: "approved" }, { $set: { status: "archived" } }),
      Driver.updateMany({ owner: partnerId, status: "approved" }, { $set: { status: "pending" } }),
    ]);
  } catch (err) {
    logger.error("unpublishPartnerListings:", err.message);
  }
}
