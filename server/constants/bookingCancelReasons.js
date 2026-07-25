// Motifs d'annulation d'une réservation — sélection obligatoire, distincte
// selon qui annule (voir Booking.cancelReasonCode / bookingController.js
// cancelBookingByClient et updateBookingStatus). Dupliqué à l'identique dans
// src/constants/bookingCancelReasons.js (pas de dossier partagé entre
// server/ et src/ dans ce repo — voir constants/incoterms.js pour le même
// pattern).

export const CLIENT_CANCEL_REASONS = [
  ["changement_de_plans",        "Changement de mes plans"],
  ["vehicule_ne_convient_plus",  "Le véhicule ne convient plus"],
  ["erreur_de_reservation",      "Erreur lors de la réservation (dates, véhicule...)"],
  ["offre_trouvee_ailleurs",     "J'ai trouvé une meilleure offre ailleurs"],
  ["probleme_avec_partenaire",   "Problème de communication avec le partenaire"],
  ["autre",                      "Autre raison"],
];

export const PARTNER_CANCEL_REASONS = [
  ["vehicule_indisponible",      "Véhicule devenu indisponible (panne, accident, maintenance)"],
  ["document_client_invalide",   "Documents du client invalides ou manquants"],
  ["erreur_annonce",             "Erreur dans l'annonce (prix, disponibilité)"],
  ["doute_fiabilite",            "Doute sur la fiabilité de la réservation"],
  ["autre",                      "Autre raison"],
];

export const CLIENT_CANCEL_REASON_CODES  = CLIENT_CANCEL_REASONS.map(([code]) => code);
export const PARTNER_CANCEL_REASON_CODES = PARTNER_CANCEL_REASONS.map(([code]) => code);
