// Miroir d'affichage de server/constants/paiement.js.
//
// Sert à N'AFFICHER que les moyens réellement acceptés ; il n'autorise rien —
// bookingController.createBooking applique la même règle côté serveur, sans
// jamais faire confiance à ce que le navigateur envoie.
export const TYPES_ESPECES_UNIQUEMENT = ["location", "activite", "chauffeur"];

export const especesUniquement = (type) => TYPES_ESPECES_UNIQUEMENT.includes(type);

export const MESSAGE_ESPECES =
  "Le règlement se fait en espèces, directement auprès du partenaire, au moment de la prestation.";
