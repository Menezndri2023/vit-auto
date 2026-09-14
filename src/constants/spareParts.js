// Secteur « pièces détachées » (décision de l'exploitant, 2026-09-14) : un
// partenaire vend une pièce en STOCK (vente directe) ou la fait venir de
// l'étranger pour le client (vente importation) — dans les deux cas, la pièce
// est LIVRÉE (jamais de retrait). Dupliqué à l'identique dans
// src/constants/spareParts.js (pas de dossier partagé server/ ↔ src/ — voir
// constants/activityTypes.js pour le même principe).

export const PART_CATEGORIES = [
  "MOTEUR", "TRANSMISSION", "FREINAGE", "SUSPENSION_DIRECTION", "ELECTRIQUE",
  "CARROSSERIE", "ECLAIRAGE", "REFROIDISSEMENT", "ECHAPPEMENT", "FILTRES_ENTRETIEN",
  "PNEUS_JANTES", "INTERIEUR", "CLIMATISATION", "ACCESSOIRES", "AUTRE",
];

export const PART_CATEGORY_LABELS = {
  MOTEUR:               "Moteur",
  TRANSMISSION:         "Transmission / boîte",
  FREINAGE:             "Freinage",
  SUSPENSION_DIRECTION: "Suspension / direction",
  ELECTRIQUE:           "Électrique / batterie",
  CARROSSERIE:          "Carrosserie",
  ECLAIRAGE:            "Éclairage",
  REFROIDISSEMENT:      "Refroidissement",
  ECHAPPEMENT:          "Échappement",
  FILTRES_ENTRETIEN:    "Filtres / entretien",
  PNEUS_JANTES:         "Pneus / jantes",
  INTERIEUR:            "Intérieur",
  CLIMATISATION:        "Climatisation",
  ACCESSOIRES:          "Accessoires",
  AUTRE:                "Autre",
};

export const PART_CATEGORY_ICONS = {
  MOTEUR: "⚙️", TRANSMISSION: "🔩", FREINAGE: "🛑", SUSPENSION_DIRECTION: "🔧", ELECTRIQUE: "🔋",
  CARROSSERIE: "🚘", ECLAIRAGE: "💡", REFROIDISSEMENT: "🌡️", ECHAPPEMENT: "💨", FILTRES_ENTRETIEN: "🛢️",
  PNEUS_JANTES: "🛞", INTERIEUR: "💺", CLIMATISATION: "❄️", ACCESSOIRES: "🧰", AUTRE: "📦",
};

// État de la pièce.
export const PART_CONDITIONS = ["neuf", "reconditionne", "occasion"];
export const PART_CONDITION_LABELS = { neuf: "Neuf", reconditionne: "Reconditionné", occasion: "Occasion" };

// Mode de vente : en stock chez le partenaire (livraison locale) ou importée
// à la commande (délai + frais d'importation annoncés sur l'annonce).
export const PART_SALE_MODES = ["direct", "import"];
export const PART_SALE_MODE_LABELS = { direct: "Vente directe (en stock)", import: "Vente importation (sur commande)" };

// Frais de livraison fixés par le partenaire sur l'annonce :
//  - gratuit  : livraison offerte ;
//  - forfait  : montant fixe (shipping.forfaitUSD), éventuellement offert
//               au-delà d'un montant de commande (shipping.freeAboveUSD) ;
//  - distance : barème pays au kilomètre (voir services/deliveryFee.js),
//               calculé depuis les coordonnées de l'annonce et celles du client.
export const PART_SHIPPING_MODES = ["gratuit", "forfait", "distance"];
export const PART_SHIPPING_MODE_LABELS = {
  gratuit:  "Livraison offerte",
  forfait:  "Forfait fixe",
  distance: "Selon la distance (barème du pays)",
};

// Étapes d'une commande de pièce, projetées sur la machine à états de
// Booking (voir bookingController.updateBookingStatus) — même statuts, sens
// propre au secteur :
export const PART_ORDER_STEPS = {
  pending:                   "Commande transmise — en attente de confirmation du vendeur",
  confirmed:                 "Confirmée par le vendeur",
  preparing:                 "En préparation (ou commandée chez le fournisseur pour une importation)",
  in_progress:               "Expédiée — en cours de livraison",
  waiting_client_validation: "Livrée — en attente de votre confirmation de réception",
  completed:                 "Réception confirmée — commande terminée",
  disputed:                  "Problème signalé à la réception",
  cancelled:                 "Annulée",
};

export const MAX_PART_QUANTITY = 50;
