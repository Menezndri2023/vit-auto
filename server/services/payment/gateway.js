import logger from "../../utils/logger.js";
import * as stripeProvider from "./providers/stripeProvider.js";
import * as orangeMoneyProvider from "./providers/orangeMoneyProvider.js";
import * as waveProvider from "./providers/waveProvider.js";
import * as simulatedProvider from "./providers/simulatedProvider.js";
import * as paydunyaProvider from "./providers/paydunyaProvider.js";

// Méthodes couvertes par un vrai fournisseur — les autres (mtn, moov, paypal,
// applepay, virement, test) n'ont pas d'intégration dédiée pour l'instant et
// passent systématiquement par le mode simulé, exactement comme une méthode
// réelle sans identifiants configurés (voir simulatedProvider.js).
const PROVIDERS = {
  card:         stripeProvider,
  orange_money: orangeMoneyProvider,
  wave:         waveProvider,
};

// ── Mode simulé : jamais en production (audit du 2026-10-09) ───────────────
// La page de simulation permet de marquer un paiement « réussi » sans argent.
// Utile en développement et pour la vérification locale ; en production, un
// client pouvait s'en servir pour faire passer SA réservation pour payée tant
// qu'aucun compte marchand n'était branché. PAYMENTS_SIMULATION=true la rouvre
// explicitement (démonstration), rien d'autre.
export const simulationAutorisee = () =>
  process.env.NODE_ENV !== "production" || process.env.PAYMENTS_SIMULATION === "true";

// Ce moyen de paiement peut-il être proposé maintenant ?
// PayDunya (agrégateur, 2026-10-09) : dès qu'il est configuré, il encaisse
// TOUS les moyens en ligne — carte comme mobile money — sur sa propre page.
const METHODES_AGREGATEUR = ["card", "orange_money", "wave", "mtn", "moov"];
export const fournisseurPour = (method) =>
  (paydunyaProvider.isConfigured() && METHODES_AGREGATEUR.includes(method)) ? paydunyaProvider : PROVIDERS[method];

export const methodeDisponible = (method) =>
  !!(fournisseurPour(method)?.isConfigured()) || simulationAutorisee();

/**
 * Point d'entrée unique pour initier un paiement : choisit le vrai fournisseur
 * si ses identifiants sont configurés (variables d'environnement), sinon
 * bascule sur le mode simulé — jamais d'erreur pour absence de configuration,
 * pour ne jamais bloquer une réservation faute de compte marchand.
 */
export async function initiateCheckout({ payment, booking }) {
  const base = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const successUrl = `${base}/payment/success?paymentId=${payment._id}`;
  const cancelUrl   = `${base}/payment/cancel?paymentId=${payment._id}`;

  const provider = fournisseurPour(payment.method);
  const useReal = provider && provider.isConfigured();
  if (!useReal && !simulationAutorisee()) {
    throw Object.assign(new Error("Paiement en ligne indisponible pour ce moyen."), { code: "PAIEMENT_INDISPONIBLE" });
  }
  const impl = useReal ? provider : simulatedProvider;

  try {
    const result = await impl.createCheckout({ payment, booking, successUrl, cancelUrl });
    return { ...result, simulated: !useReal, fournisseur: useReal && impl === paydunyaProvider ? "paydunya" : null };
  } catch (err) {
    // Un fournisseur réel mal configuré/indisponible ne doit pas empêcher la
    // réservation d'aboutir — on retombe sur le mode simulé et on logue l'échec
    // pour investigation, plutôt que de renvoyer une erreur au client.
    if (useReal && simulationAutorisee()) {
      logger.error("[PaymentGateway] Échec fournisseur réel — repli simulé", { method: payment.method, error: err.message });
      const fallback = await simulatedProvider.createCheckout({ payment, booking, successUrl, cancelUrl });
      return { ...fallback, simulated: true };
    }
    throw err;
  }
}

export { stripeProvider, orangeMoneyProvider, waveProvider, paydunyaProvider };
