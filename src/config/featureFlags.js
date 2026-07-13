// ── Feature flags frontend ───────────────────────────────────────────────────
// Interrupteurs simples pour désactiver une fonctionnalité sans supprimer son
// code (backend + UI restent en place, juste inertes côté utilisateur).

// Abonnements Pro & mises en avant (boost) — désactivés le temps qu'un vrai
// prestataire de paiement soit branché (aucune passerelle réelle aujourd'hui,
// tout restait "pending" en attente de confirmation manuelle admin).
export const SUBSCRIPTIONS_ENABLED = false;
