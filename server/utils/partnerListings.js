import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import logger from "./logger.js";

// Dépublie en masse toutes les annonces actives d'un partenaire — à appeler
// quand son dossier de vérification/KYC passe à un statut qui ne l'autorise
// plus à publier (suspendu/rejeté/refusé, voir partnerVerificationController
// .adminUpdateStatus et kycController.adminReviewKyc). Sans ça, ses annonces
// déjà approuvées restaient visibles et réservables indéfiniment malgré la
// suspension — bug réel trouvé en audit. Réversible : available/status
// repassent à leur valeur normale à la prochaine action du partenaire, jamais
// de suppression.
export async function unpublishPartnerListings(partnerId) {
  try {
    await Promise.all([
      Vehicle.updateMany({ owner: partnerId, available: true }, { $set: { available: false } }),
      ImportExportListing.updateMany({ partner: partnerId, status: "approved" }, { $set: { status: "archived" } }),
    ]);
  } catch (err) {
    logger.error("unpublishPartnerListings:", err.message);
  }
}
