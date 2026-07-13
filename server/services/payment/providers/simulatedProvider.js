import logger from "../../../utils/logger.js";

/**
 * Fournisseur de repli — utilisé quand aucun identifiant réel n'est configuré
 * pour la méthode demandée (voir gateway.js). Permet de tester tout le
 * parcours réservation → paiement → confirmation dès maintenant, sans compte
 * marchand ; il suffit d'ajouter les vraies clés d'API plus tard (mêmes
 * variables d'environnement lues par les autres fournisseurs) pour basculer
 * en conditions réelles, sans toucher au code.
 *
 * Le "checkout" est une page interne (voir routes/payments.js +
 * src/pages/PaymentSimulate.jsx) où l'on peut simuler un succès ou un échec —
 * contrairement à un auto-complete silencieux, ça garde la boucle
 * pending → completed/failed réellement exercée par un vrai humain/test,
 * au lieu de biaiser le flux en le confirmant tout seul.
 */
export async function createCheckout({ payment }) {
  logger.info("[Payment] Mode simulé (aucun identifiant fournisseur configuré)", {
    paymentId: payment._id.toString(),
    method: payment.method,
  });
  const base = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  return {
    checkoutUrl: `${base}/payment/simulate/${payment._id}`,
    providerRef: `sim_${payment._id}`,
  };
}
