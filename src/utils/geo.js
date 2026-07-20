import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// Enveloppe getCurrentPosition avec la même signature que l'API navigateur
// (callbacks success/error, err.code 1=refusé/2=indisponible/3=timeout) pour
// que les appelants existants n'aient pas à changer — mais utilise le plugin
// natif Capacitor.Geolocation sur iOS/Android (permission système native au
// lieu du prompt WebView, plus fiable en arrière-plan/premier-plan).
export function getCurrentPosition(onSuccess, onError, options) {
  if (Capacitor.isNativePlatform()) {
    Geolocation.getCurrentPosition(options)
      .then(onSuccess)
      .catch((err) => {
        const denied = /denied|permission/i.test(err?.message || "");
        onError?.({ code: denied ? 1 : 2, message: err?.message });
      });
    return;
  }
  if (!navigator.geolocation) {
    onError?.({ code: 2, message: "Géolocalisation non supportée par ce navigateur." });
    return;
  }
  navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
}

// Distance en km entre deux points GPS (formule de Haversine) — même formule
// que server/services/deliveryFee.js, dupliquée ici volontairement car le
// calcul se fait côté client (pas d'appel réseau nécessaire pour trier une
// liste déjà chargée par distance).
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

// Géocodage d'adresse texte → coordonnées GPS via Nominatim (OpenStreetMap,
// gratuit, sans clé API). Utilisé à la publication d'un véhicule (pour
// peupler Vehicle.coordonnees, requis par le calcul des frais de livraison
// server/services/deliveryFee.js) et lors d'une réservation (estimation de
// repli si /api/geo/delivery-fee échoue).
export async function geocodeAddress(address) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, { headers: { "Accept-Language": "fr" } });
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* réseau indisponible */ }
  return null;
}

// Coordonnées GPS → adresse texte (Nominatim reverse) — utilisé pour le
// pré-remplissage "Utiliser ma position" à la publication (ville + adresse),
// plus précis que la seule géolocalisation IP.
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { "Accept-Language": "fr" } });
    const data = await res.json();
    const a = data?.address;
    if (!a) return null;
    const road = [a.road, a.house_number].filter(Boolean).join(" ");
    const city = a.city || a.town || a.village || a.county || null;
    return { address: road || data.display_name || null, city };
  } catch { /* réseau indisponible */ }
  return null;
}
