// ── Feature flags frontend ───────────────────────────────────────────────────
// Interrupteurs simples pour désactiver une fonctionnalité sans supprimer son
// code (backend + UI restent en place, juste inertes côté utilisateur).

// Abonnements & mises en avant (boost) — réactivés avec la refonte du modèle
// économique (tarifs USD configurables, voir PricingConfig). Le mécanisme de
// paiement reste inchangé (aucune passerelle de paiement récurrent réelle
// branchée) : toute demande passe en "pending" jusqu'à confirmation manuelle
// admin — voir subscriptionController.js activatePlan/purchaseBoost.
export const SUBSCRIPTIONS_ENABLED = true;
