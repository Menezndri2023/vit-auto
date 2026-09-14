// ── Ce qui se règle en espèces, chez le partenaire ─────────────────────────
//
// Décision produit : tant qu'aucun agrégateur de paiement n'est branché, les
// prestations rendues SUR PLACE se règlent directement au partenaire, en
// espèces. Encaisser en ligne sans prestataire réel — donc sans webhook signé
// pour vérifier le paiement — reviendrait à déclarer payées des réservations
// dont rien ne prouve qu'elles l'aient été.
//
// Le périmètre est défini ICI et nulle part ailleurs : la règle vivait en dur
// dans le contrôleur pour la seule location, et les activités y échappaient.
// Une liste nommée rend l'oubli visible, et l'ouverture future d'un type se
// fait en retirant une ligne.
export const TYPES_ESPECES_UNIQUEMENT = ["location", "activite", "chauffeur", "piece"];

export const especesUniquement = (type) => TYPES_ESPECES_UNIQUEMENT.includes(type);

// `essai` et `leasing` restent hors de cette liste, et ce n'est pas un oubli :
// l'essai est gratuit, et le leasing engage un financement dont le premier
// versement ne se règle pas au comptoir.
export const MESSAGE_ESPECES =
  "Le règlement se fait en espèces, directement auprès du partenaire, au moment de la prestation.";

// Pièce détachée (secteur « pièces », 2026-09-14) : toujours livrée, réglée à
// la réception ; une importation peut exiger un acompte à la confirmation,
// annoncé sur l'annonce (SparePart.importInfo.depositPercent).
export const MESSAGE_ESPECES_PIECE =
  "Le règlement se fait en espèces au livreur, à la réception de la pièce. Pour une pièce importée, l'acompte annoncé sur l'annonce est réglé au vendeur à la confirmation de la commande.";
