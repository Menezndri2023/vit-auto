// ── Plafonds d'absurdité ───────────────────────────────────────────────────
//
// Ce ne sont PAS des plafonds de marché : une voiture de sport se loue
// légitimement 1 500 USD la journée, et une pièce de collection se vend des
// millions. Ce sont les bornes au-delà desquelles un chiffre ne peut plus être
// un prix, seulement une erreur de saisie — typiquement un prix de VENTE ou un
// tarif MENSUEL entré dans la case journalière, ou une devise confondue.
//
// Cas réel : une Changan CS55 publiée à 60 600 MAD/jour, soit 6 110 USD, quand
// toutes les autres locations du même pays tiennent entre 45 et 101 USD. Elle
// est restée en ligne, réservable, pendant plus d'un mois — personne ne l'avait
// vue, et rien ne la signalait.
//
// Le contrôle REFUSE plutôt qu'il n'avertit : un avertissement dans une réponse
// HTTP n'est lu par personne, et le partenaire découvrirait son erreur à la
// première réservation.
export const PRIX_JOUR_MAX_USD = 2000;
export const PRIX_VENTE_MAX_USD = 5_000_000;
export const CAUTION_MAX_USD = 200_000;

// Renvoie `null` si tout est plausible, sinon `{ champ, message }`.
export function prixInvraisemblable({ type, pricePerDay, priceForSale, caution } = {}) {
  if (type === "location" && pricePerDay > PRIX_JOUR_MAX_USD) {
    return {
      champ: "pricePerDay",
      message: `Un tarif de ${Math.round(pricePerDay)} USD par jour dépasse la limite de ${PRIX_JOUR_MAX_USD} USD. Vérifiez la devise, et qu'il s'agit bien d'un prix JOURNALIER et non mensuel ou de vente.`,
    };
  }
  if (type === "vente" && priceForSale > PRIX_VENTE_MAX_USD) {
    return {
      champ: "priceForSale",
      message: `Un prix de vente de ${Math.round(priceForSale)} USD dépasse la limite de ${PRIX_VENTE_MAX_USD} USD. Vérifiez la devise saisie.`,
    };
  }
  if (caution > CAUTION_MAX_USD) {
    return {
      champ: "caution",
      message: `Une caution de ${Math.round(caution)} USD dépasse la limite de ${CAUTION_MAX_USD} USD. Vérifiez la devise saisie.`,
    };
  }
  return null;
}
