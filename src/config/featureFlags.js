// ── Feature flags frontend ───────────────────────────────────────────────────
// Interrupteurs simples pour désactiver une fonctionnalité sans supprimer son
// code (backend + UI restent en place, juste inertes côté utilisateur).

// PAIEMENTS — l'interrupteur réel vit CÔTÉ SERVEUR
// (server/config/featureFlags.js, variable d'environnement PAYMENTS_ENABLED)
// et arrive ici via GET /api/pricing/config → `paymentsEnabled`. Les pages
// concernées (Plans, VendorDashboard, VendorPublish) le lisent de là.
//
// Cette valeur n'est qu'un REPLI, utilisé tant que la config n'a pas répondu
// ou si l'appel échoue. Elle est fausse à dessein : mieux vaut un bouton
// inerte à tort qu'un paiement proposé alors qu'aucune passerelle n'est
// branchée — le serveur refuserait de toute façon (503 PAYMENTS_DISABLED).
export const PAYMENTS_ENABLED_FALLBACK = false;

// Message affiché à côté de toute action payante tant que les paiements sont
// fermés. Il doit dire QUOI faire, pas seulement que c'est indisponible.
export const PAYMENTS_DISABLED_NOTICE =
  "Paiement en ligne pas encore ouvert : votre demande part au support, qui active le plan sur votre compte.";

// Libellé du bouton tant que les paiements ne sont pas ouverts. Le bouton
// reste ACTIF : demander un plan ne prend pas d'argent, cela enregistre une
// intention qu'un administrateur confirme à la main (voir
// subscriptionController.activatePlan). Le griser fermait la seule voie
// réellement disponible.
export const PAYMENTS_DISABLED_CTA = "Demander l'activation";
