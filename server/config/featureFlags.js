// ── Interrupteurs serveur ────────────────────────────────────────────────────

// PAIEMENTS — aucune passerelle de paiement n'est branchée en production à ce
// jour. Tant que ce n'est pas le cas, aucune action payante ne doit aboutir :
// abonnements, mises en avant (boosts) et publicités restent VISIBLES dans
// l'interface, mais inertes, et le serveur les refuse explicitement.
//
// Le défaut est FAUX, et volontairement : une variable absente, mal orthographiée
// ou perdue lors d'un redéploiement laisse les paiements FERMÉS. L'inverse
// encaisserait de l'argent sans moyen de le percevoir ni de le rembourser.
//
// Pour ouvrir : PAYMENTS_ENABLED=true dans l'environnement (Render), sans
// redéploiement de code. C'est l'unique interrupteur — l'interface lit cette
// même valeur via GET /api/pricing/config, elle ne la duplique jamais.
export const PAYMENTS_ENABLED = process.env.PAYMENTS_ENABLED === "true";
// Même interrupteur, relu à chaque appel (paiement en ligne des réservations).
export const paiementsOuverts = () => process.env.PAYMENTS_ENABLED === "true";

// SÉQUESTRE IMPORT/EXPORT — DÉSACTIVÉ (décision de l'exploitant, 2026-10-30).
// Tant que les exigences juridiques, contractuelles et celles du prestataire
// de paiement ne sont pas validées, VIT AUTO n'encaisse, ne bloque, ne
// sécurise ni ne débloque aucun fonds pour une transaction Import/Export :
// l'acheteur règle l'exportateur directement, selon leur contrat, et la
// plateforme n'enregistre que des déclarations. Même défaut que PAYMENTS_ENABLED :
// une variable absente laisse le séquestre FERMÉ. Il n'existe volontairement
// aucun réglage admin pour le rouvrir.
export const SEQUESTRE_IE_ACTIF = process.env.IE_ESCROW_ENABLED === "true";

export const SEQUESTRE_SUSPENDU_MESSAGE =
  "VIT AUTO ne reçoit ni ne conserve les fonds des transactions Import/Export. Réglez l'exportateur directement, selon votre contrat, puis déclarez le règlement sur la transaction.";

// Message unique renvoyé au client comme affiché dans l'interface : il doit
// dire QUOI faire, pas seulement que c'est indisponible.
export const PAYMENTS_DISABLED_MESSAGE =
  "Les paiements ne sont pas encore ouverts sur VIT AUTO. Contactez le support pour activer cette option sur votre compte.";
