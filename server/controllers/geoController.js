import geoip from "geoip-lite";
import Vehicle from "../models/Vehicle.js";
import { resolveDeliveryFee, detectCountryFromCoords } from "../services/deliveryFee.js";
import { getActiveCountries, getActiveRates } from "../services/currencyEngine.js";

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

  const result = await resolveDeliveryFee({
    clientLat: cLat, clientLng: cLng, vehicleLat: pLat, vehicleLng: pLng, countryCode,
  });

  return res.json({ countryCode, ...result });
};

/**
 * GET /api/geo/my-country
 * Détecte le pays du visiteur depuis son adresse IP — base de données locale
 * (geoip-lite, hors ligne, aucun appel réseau tiers), contrairement à
 * l'ancienne détection 100% côté client (fetch direct vers ipapi.co) qui
 * échouait silencieusement (bloqueur de pub, CORS, quota du service tiers) et
 * retombait alors systématiquement sur le Maroc par défaut pour n'importe
 * quel visiteur, y compris ceux d'Afrique de l'Ouest (marché principal). Le
 * frontend garde ipapi.co comme repli si jamais cet endpoint échoue aussi.
 */
export const getMyCountry = (req, res) => {
  // req.ip respecte déjà "trust proxy" (voir server.js) — c'est la vraie IP du
  // visiteur, pas celle du proxy Railway. Le préfixe IPv4-mapped IPv6 doit être
  // retiré avant le lookup (geoip-lite ne le fait pas lui-même).
  const ip = (req.ip || "").replace(/^::ffff:/, "");
  const info = geoip.lookup(ip);
  if (!info?.country) {
    // IP locale/privée (dev) ou introuvable dans la base — pas une erreur,
    // juste "on ne sait pas", le frontend garde son repli existant.
    return res.json({ country: null, city: null });
  }
  res.json({ country: info.country, city: info.city || null, ll: info.ll || null });
};

/**
 * GET /api/geo/countries
 * Retourne la liste complète des pays supportés
 */
export const getCountries = async (_req, res) => {
  const [countries, rates] = await Promise.all([getActiveCountries(), getActiveRates()]);
  const symbolByCode = Object.fromEntries(rates.map((r) => [r.code, r.symbol]));
  const list = countries.map((c) => ({
    code: c.code, name: c.name, flag: c.flag,
    currency: c.defaultCurrency, currencySymbol: symbolByCode[c.defaultCurrency] || c.defaultCurrency,
    languages: c.languages, paymentMethods: c.paymentMethods,
    deliveryRatePerKm: c.deliveryRatePerKm, deliveryBaseRate: c.deliveryBaseRate, deliveryMaxKm: c.deliveryMaxKm,
  }));
  res.json(list);
};
