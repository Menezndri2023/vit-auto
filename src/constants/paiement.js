// Miroir d'affichage de server/constants/paiement.js.
//
// Sert à N'AFFICHER que les moyens réellement acceptés ; il n'autorise rien —
// bookingController.createBooking applique la même règle côté serveur, sans
// jamais faire confiance à ce que le navigateur envoie.
export const TYPES_ESPECES_UNIQUEMENT = ["location", "activite", "chauffeur", "piece"];

export const especesUniquement = (type) => TYPES_ESPECES_UNIQUEMENT.includes(type);

export const MESSAGE_ESPECES =
  "Le règlement se fait en espèces, directement auprès du partenaire, au moment de la prestation.";

// Pièce détachée (secteur « pièces », 2026-09-14) : toujours livrée, réglée à
// la réception ; une importation peut exiger un acompte à la confirmation,
// annoncé sur l'annonce (SparePart.importInfo.depositPercent).
export const MESSAGE_ESPECES_PIECE =
  "Le règlement se fait en espèces au livreur, à la réception de la pièce. Pour une pièce importée, l'acompte annoncé sur l'annonce est réglé au vendeur à la confirmation de la commande.";
