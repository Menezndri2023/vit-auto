import geoip from "geoip-lite";
import Vehicle from "../models/Vehicle.js";
import { resolveDeliveryFee, detectCountryFromCoords } from "../services/deliveryFee.js";
import { getActiveCountries, getActiveRates } from "../services/currencyEngine.js";
import logger from "../utils/logger.js";

/**
 * GET|POST /api/geo/delivery-fee
 * Query (GET) ou Body (POST) :
 *   clientLat, clientLng           — position du client
 *   partnerLat?, partnerLng?       — position du partenaire (ou vehicleId)
 *   vehicleId?                     — si fourni, récupère les coords depuis la DB
 *   countryCode?                   — code pays (auto-détecté si absent)
 */
// Bug réel corrigé (audit résilience) : ce handler n'avait aucun try/catch —
// seuls 2 handlers de tout `controllers/` étaient dans ce cas (vérifié
// systématiquement). Express 4 ne route pas un rejet de promesse non catché
// vers le middleware d'erreur : une panne DB pendant Vehicle.findById ou
// resolveDeliveryFee laissait la requête sans AUCUNE réponse (ni 500, ni
// log), jusqu'au timeout du proxy/navigateur.
export const getDeliveryFee = async (req, res) => {
  try {
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
  } catch (err) {
    logger.error("getDeliveryFee:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
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
// Bug réel corrigé (audit) : `req.ip` dépend du nombre exact de sauts
// configuré via `trust proxy` (voir server.js, "trust proxy" à 1) — correct
// pour Railway (mort, voir mémoire projet) mais jamais revérifié pour Render,
// dont le domaine personnalisé vit-auto.com peut ajouter un saut CDN/DNS
// supplémentaire devant l'edge de Render lui-même. Un saut de trop et
// `req.ip` résout systématiquement l'IP du PROXY (toujours le même pays,
// souvent celui de l'infra du CDN) au lieu de celle du visiteur — la
// détection semble alors "ne jamais fonctionner", pour TOUS les visiteurs,
// peu importe leur pays réel. Pour un simple affichage de devise (pas un
// contrôle de sécurité comme le rate-limiting), on peut se permettre de lire
// directement le premier maillon de X-Forwarded-For — toujours l'IP d'origine
// réelle, quel que soit le nombre de proxys de confiance entre elle et nous —
// plutôt que de dépendre d'un réglage "trust proxy" qui doit rester exact.
function resolveClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  const first = xff ? xff.split(",")[0].trim() : null;
  return (first || req.ip || "").replace(/^::ffff:/, "");
}

export const getMyCountry = (req, res) => {
  const ip = resolveClientIp(req);
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
  try {
    const [countries, rates] = await Promise.all([getActiveCountries(), getActiveRates()]);
    const symbolByCode = Object.fromEntries(rates.map((r) => [r.code, r.symbol]));
    const list = countries.map((c) => ({
      code: c.code, name: c.name, flag: c.flag,
      currency: c.defaultCurrency, currencySymbol: symbolByCode[c.defaultCurrency] || c.defaultCurrency,
      languages: c.languages, paymentMethods: c.paymentMethods,
      deliveryRatePerKm: c.deliveryRatePerKm, deliveryBaseRate: c.deliveryBaseRate, deliveryMaxKm: c.deliveryMaxKm,
    }));
    res.json(list);
  } catch (err) {
    logger.error("getCountries:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
