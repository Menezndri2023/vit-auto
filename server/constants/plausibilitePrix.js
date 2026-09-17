// ── Montants des annonces : AUCUN plafond ──────────────────────────────────
//
// Décision de l'exploitant (2026-09-17) : un partenaire choisit librement son
// tarif et sa caution, pour tous les services (location, vente, chauffeur,
// activités, pièces, export). Les plafonds « d'absurdité » ajoutés le
// 2026-09-10 (2 000 USD/jour, 5 M USD à la vente, 200 000 USD de caution)
// refusaient des publications réelles avec « dépasse la limite » : un
// partenaire ne doit jamais être bloqué par une borne décidée à sa place.
//
// Ce qui reste : un AVERTISSEMENT informatif du moteur de validation
// (services/vehicleScoring.js) sur un montant inhabituel, marqué ci-dessous,
// que la vitrine d'accueil utilise pour ne pas mettre en avant une annonce au
// prix douteux (l'annonce reste publiée et réservable). L'admin voit
// l'avertissement dans sa file de validation.
export const MARQUEUR_MONTANT_DOUTEUX = "[MONTANT]";
