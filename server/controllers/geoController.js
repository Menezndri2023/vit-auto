import { calculateDeliveryFee, COUNTRIES } from "../config/countries.js";

/**
 * Formule de Haversine — retourne la distance en km entre deux points GPS
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /api/geo/delivery-fee
 * Body: { clientLat, clientLng, partnerLat, partnerLng, countryCode? }
 * Retourne les frais de livraison calculés par GPS
 */
export const getDeliveryFee = (req, res) => {
  const { clientLat, clientLng, partnerLat, partnerLng, countryCode = "CI" } = req.body;

  if (
    clientLat == null || clientLng == null ||
    partnerLat == null || partnerLng == null
  ) {
    return res.status(400).json({ message: "Coordonnées GPS manquantes." });
  }

  const cLat  = parseFloat(clientLat);
  const cLng  = parseFloat(clientLng);
  const pLat  = parseFloat(partnerLat);
  const pLng  = parseFloat(partnerLng);

  if ([cLat, cLng, pLat, pLng].some(isNaN)) {
    return res.status(400).json({ message: "Coordonnées GPS invalides." });
  }

  const distanceKm = haversineKm(cLat, cLng, pLat, pLng);
  const result     = calculateDeliveryFee(countryCode, distanceKm);

  return res.json({
    distanceKm: Math.round(distanceKm * 10) / 10,
    ...result,
  });
};

/**
 * GET /api/geo/countries
 * Retourne la liste des pays supportés
 */
export const getCountries = (_req, res) => {
  const list = COUNTRIES.map(({ code, name, flag, currency, currencySymbol, languages, paymentMethods }) => ({
    code, name, flag, currency, currencySymbol, languages, paymentMethods,
  }));
  res.json(list);
};
