// Contestation d'une réservation (2026-11-01) : le serveur ne change plus le
// statut — la réservation reste « en attente de validation », contestée par le
// client (clientValidation.disputedAt). Les écrans l'affichent comme « Litige
// ouvert », exactement comme l'ancien statut « disputed » encore lu pour les
// réservations anciennes. Affichage seulement : chaque action est revérifiée
// par le serveur.
export const estContestee = (b) => b?.status === "disputed" || (b?.status === "waiting_client_validation" && !!b?.clientValidation?.disputedAt);

export const avecStatutAffiche = (b) => (b?.status === "waiting_client_validation" && b.clientValidation?.disputedAt
  ? { ...b, status: "disputed" }
  : b);
