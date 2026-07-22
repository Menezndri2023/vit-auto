import { calculateDeliveryFee } from "./currencyEngine.js";

/**
 * Formule de Haversine — distance en km entre deux points GPS.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
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

const COUNTRY_BBOXES = {
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

/**
 * Détecte le pays depuis les coordonnées (lat/lng) via les bounding boxes ci-dessus.
 * Fallback : "CI"
 */
export function detectCountryFromCoords(lat, lng) {
  for (const [code, b] of Object.entries(COUNTRY_BBOXES)) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return code;
    }
  }
  return "CI";
}

/**
 * Calcule le frais de livraison de façon autoritaire côté serveur à partir des
 * coordonnées du véhicule (jamais depuis une valeur fournie par le client).
 * Retourne null si la distance ne peut pas être calculée (coords manquantes).
 */
export async function resolveDeliveryFee({ clientLat, clientLng, vehicleLat, vehicleLng, countryCode }) {
  const cLat = parseFloat(clientLat);
  const cLng = parseFloat(clientLng);
  const vLat = parseFloat(vehicleLat);
  const vLng = parseFloat(vehicleLng);

  if ([cLat, cLng, vLat, vLng].some((n) => Number.isNaN(n))) return null;

  const distanceKm = haversineKm(cLat, cLng, vLat, vLng);
  const result = await calculateDeliveryFee(countryCode || "CI", distanceKm);
  return { distanceKm: Math.round(distanceKm * 10) / 10, ...result };
}
