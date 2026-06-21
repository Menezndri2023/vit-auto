import { calculateDeliveryFee, COUNTRIES } from "../config/countries.js";
import Vehicle from "../models/Vehicle.js";

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
 * Détecte le pays depuis les coordonnées (lat/lng) via les bounding boxes des COUNTRIES
 * Fallback : "CI"
 */
function detectCountryFromCoords(lat, lng) {
  const BBOXES = {
    CI: { minLat: 4.3,  maxLat: 10.7, minLng: -8.6, maxLng: -2.5 },
    SN: { minLat: 12.3, maxLat: 16.7, minLng: -17.5, maxLng: -11.4 },
    ML: { minLat: 10.1, maxLat: 25.0, minLng: -12.2, maxLng: 4.2  },
    BF: { minLat: 9.4,  maxLat: 15.1, minLng: -5.5,  maxLng: 2.4  },
    GN: { minLat: 7.2,  maxLat: 12.7, minLng: -15.1, maxLng: -7.6 },
    GH: { minLat: 4.7,  maxLat: 11.2, minLng: -3.3,  maxLng: 1.2  },
    NG: { minLat: 4.2,  maxLat: 13.9, minLng: 2.7,   maxLng: 14.7 },
    TG: { minLat: 6.1,  maxLat: 11.1, minLng: -0.1,  maxLng: 1.8  },
    BJ: { minLat: 6.2,  maxLat: 12.4, minLng: 0.8,   maxLng: 3.8  },
    CM: { minLat: 1.7,  maxLat: 13.1, minLng: 8.4,   maxLng: 16.2 },
    MA: { minLat: 27.7, maxLat: 35.9, minLng: -13.2, maxLng: -1.0 },
    DZ: { minLat: 18.9, maxLat: 37.1, minLng: -8.7,  maxLng: 12.0 },
    TN: { minLat: 30.2, maxLat: 37.5, minLng: 7.5,   maxLng: 11.6 },
    FR: { minLat: 41.3, maxLat: 51.1, minLng: -5.1,  maxLng: 9.6  },
    BE: { minLat: 49.5, maxLat: 51.5, minLng: 2.5,   maxLng: 6.4  },
    ES: { minLat: 35.9, maxLat: 43.8, minLng: -9.3,  maxLng: 4.3  },
    CH: { minLat: 45.8, maxLat: 47.8, minLng: 5.9,   maxLng: 10.5 },
    AE: { minLat: 22.6, maxLat: 26.1, minLng: 51.6,  maxLng: 56.4 },
    CN: { minLat: 18.2, maxLat: 53.6, minLng: 73.5,  maxLng: 135.1 },
    US: { minLat: 24.4, maxLat: 49.4, minLng: -124.8, maxLng: -66.9 },
    CA: { minLat: 41.7, maxLat: 83.1, minLng: -141.0, maxLng: -52.6 },
  };

  for (const [code, b] of Object.entries(BBOXES)) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return code;
    }
  }
  return "CI"; // fallback
}

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

  const distanceKm = haversineKm(cLat, cLng, pLat, pLng);
  const result     = calculateDeliveryFee(countryCode, distanceKm);

  return res.json({
    distanceKm: Math.round(distanceKm * 10) / 10,
    countryCode,
    ...result,
  });
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
