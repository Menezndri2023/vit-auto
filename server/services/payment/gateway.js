import logger from "../../utils/logger.js";
import * as stripeProvider from "./providers/stripeProvider.js";
import * as orangeMoneyProvider from "./providers/orangeMoneyProvider.js";
import * as waveProvider from "./providers/waveProvider.js";
import * as simulatedProvider from "./providers/simulatedProvider.js";

// Méthodes couvertes par un vrai fournisseur — les autres (mtn, moov, paypal,
// applepay, virement, test) n'ont pas d'intégration dédiée pour l'instant et
// passent systématiquement par le mode simulé, exactement comme une méthode
// réelle sans identifiants configurés (voir simulatedProvider.js).
const PROVIDERS = {
  card:         stripeProvider,
  orange_money: orangeMoneyProvider,
  wave:         waveProvider,
};

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

  const provider = PROVIDERS[payment.method];
  const useReal = provider && provider.isConfigured();
  const impl = useReal ? provider : simulatedProvider;

  try {
    const result = await impl.createCheckout({ payment, booking, successUrl, cancelUrl });
    return { ...result, simulated: !useReal };
  } catch (err) {
    // Un fournisseur réel mal configuré/indisponible ne doit pas empêcher la
    // réservation d'aboutir — on retombe sur le mode simulé et on logue l'échec
    // pour investigation, plutôt que de renvoyer une erreur au client.
    if (useReal) {
      logger.error("[PaymentGateway] Échec fournisseur réel — repli simulé", { method: payment.method, error: err.message });
      const fallback = await simulatedProvider.createCheckout({ payment, booking, successUrl, cancelUrl });
      return { ...fallback, simulated: true };
    }
    throw err;
  }
}

export { stripeProvider, orangeMoneyProvider, waveProvider };
