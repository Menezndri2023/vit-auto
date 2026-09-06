import { useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { reverseGeocode } from "../../utils/geo";
import styles from "./DeliveryMapPicker.module.css";

// Booking Engine — livraison (2026-09). Aucune librairie de carte n'existait
// dans le projet — le client ne pouvait jusqu'ici que taper une adresse ou
// utiliser sa position GPS ponctuelle (Booking.jsx handleDetectGPS), jamais
// ajuster un point précis. Leaflet + tuiles OpenStreetMap : gratuit, sans
// clé API, cohérent avec le choix déjà fait de Nominatim pour le geocoding
// (src/utils/geo.js) plutôt qu'une API cartographique payante.

// Icône par défaut de Leaflet en DivIcon (évite le problème classique des
// chemins d'images relatifs cassés par les bundlers type Vite/webpack).
const markerIcon = L.divIcon({
  className: styles.marker,
  html: "📍",
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

function ClickToMove({ onMove }) {
  useMapEvents({
    click(e) { onMove(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

// `initialPosition` : {lat,lng} déjà connu (ex. GPS détecté) sinon `fallbackCenter`
// (ville du véhicule) — jamais un centre arbitraire (mauvaise expérience si
// le partenaire est à l'autre bout du pays).
export default function DeliveryMapPicker({ initialPosition, fallbackCenter, onConfirm, onClose }) {
  const center = initialPosition || fallbackCenter || { lat: 33.5731, lng: -7.5898 }; // Casablanca, repli neutre
  const [position, setPosition] = useState(center);
  const [address, setAddress]   = useState("");
  const [city, setCity]         = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [loading, setLoading]   = useState(false);

  const applyPosition = useCallback(async (lat, lng) => {
    setPosition({ lat, lng });
    setLoading(true);
    try {
      const result = await reverseGeocode(lat, lng);
      setAddress(result?.address || "");
      setCity(result?.city || "");
      setPostalCode(result?.postalCode || "");
    } finally {
      setLoading(false);
    }
  }, []);

  const markerEventHandlers = useMemo(() => ({
    dragend(e) {
      const { lat, lng } = e.target.getLatLng();
      applyPosition(lat, lng);
    },
  }), [applyPosition]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>📍 Choisir le lieu de livraison</h3>
        <p className={styles.hint}>Déplacez le repère ou touchez la carte pour ajuster précisément l'emplacement.</p>

        <div className={styles.mapWrap}>
          <MapContainer center={[center.lat, center.lng]} zoom={14} className={styles.map} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={[position.lat, position.lng]}
              icon={markerIcon}
              draggable
              eventHandlers={markerEventHandlers}
            />
            <ClickToMove onMove={applyPosition} />
          </MapContainer>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>
            Adresse
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={loading ? "Recherche en cours…" : "Adresse détectée"} />
          </label>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              Ville
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className={styles.field}>
              Code postal
              <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.confirmBtn} onClick={() => onConfirm({ ...position, address, city, postalCode })}>
            ✅ Utiliser cet emplacement
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
