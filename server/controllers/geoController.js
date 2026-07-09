import { COUNTRIES } from "../config/countries.js";
import Vehicle from "../models/Vehicle.js";
import { resolveDeliveryFee, detectCountryFromCoords } from "../services/deliveryFee.js";

/**
 * GET|POST /api/geo/delivery-fee
 * Query (GET) ou Body (POST) :
 *   clientLat, clientLng           — position du client
 *   partnerLat?, partnerLng?       — position du partenaire (ou vehicleId)
 *   vehicleId?                     — si fourni, récupère les coords depuis la DB
 *   countryCode?                   — code pays (auto-détecté si absent)
 */
export const getDeliveryFee = async (req, res) => {
  // Supporte GET (query) et POST (body)
  const params = { ...req.query, ...req.body };
  let { clientLat, clientLng, partnerLat, partnerLng, vehicleId, countryCode } = params;

  if (clientLat == null || clientLng == null) {
    return res.status(400).json({ message: "clientLat et clientLng sont requis." });
  }

  const cLat = parseFloat(clientLat);
  const cLng = parseFloat(clientLng);

  if (isNaN(cLat) || isNaN(cLng)) {
    return res.status(400).json({ message: "Coordonnées client invalides." });
  }

  let pLat = parseFloat(partnerLat);
  let pLng = parseFloat(partnerLng);

  // Si vehicleId fourni et coords partenaire absentes → chercher en base
  if ((isNaN(pLat) || isNaN(pLng)) && vehicleId) {
    try {
      const vehicle = await Vehicle.findById(vehicleId).select("coordonnees adresse ville");
      if (vehicle?.coordonnees?.lat != null && vehicle?.coordonnees?.lng != null) {
        pLat = vehicle.coordonnees.lat;
        pLng = vehicle.coordonnees.lng;
      }
    } catch { /* coords non disponibles */ }
  }

  // Auto-détecter le pays depuis les coordonnées client si absent
  if (!countryCode) {
    countryCode = detectCountryFromCoords(cLat, cLng);
  }

  // Sans coords partenaire → on ne peut pas calculer la distance
  if (isNaN(pLat) || isNaN(pLng)) {
    return res.status(400).json({
      message: "Coordonnées partenaire manquantes. Fournissez partnerLat/partnerLng ou un vehicleId avec adresse géocodée.",
    });
  }

  const result = resolveDeliveryFee({
    clientLat: cLat, clientLng: cLng, vehicleLat: pLat, vehicleLng: pLng, countryCode,
  });

  return res.json({ countryCode, ...result });
};

/**
 * GET /api/geo/countries
 * Retourne la liste complète des pays supportés
 */
export const getCountries = (_req, res) => {
  const list = COUNTRIES.map(({
    code, name, flag, currency, currencySymbol, languages, paymentMethods,
    deliveryRatePerKm, deliveryBaseRate, deliveryMaxKm,
  }) => ({
    code, name, flag, currency, currencySymbol, languages, paymentMethods,
    deliveryRatePerKm, deliveryBaseRate, deliveryMaxKm,
  }));
  res.json(list);
};
