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
