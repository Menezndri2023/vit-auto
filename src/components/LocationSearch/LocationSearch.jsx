import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useLocation } from '../../context/LocationContext';
import styles from './LocationSearch.module.css';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Mock vehicles
const mockVehicles = [
  { id: 1, lat: 48.8566, lng: 2.3522, model: 'Renault Clio', price: '25€/j', color: 'red' },
  { id: 2, lat: 48.8606, lng: 2.3376, model: 'Peugeot 208', price: '30€/j', color: 'blue' },
  { id: 3, lat: 48.8473, lng: 2.3731, model: 'Citroën C3', price: '28€/j', color: 'green' },
  { id: 4, lat: 48.8630, lng: 2.3300, model: 'Tesla Model 3', price: '80€/j', color: 'black' },
];

const LocationMarker = ({ position }) => {
  useMapEvents({
    click() {
      console.log('Map clicked');
    },
  });

  return position ? (
    <Marker position={[position.lat, position.lng]}>
      <Popup>Vous êtes ici ! 📍 <br /> Rafraîchir: Ctrl+R</Popup>
    </Marker>
  ) : null;
};

const LocationSearch = () => {
  const { position, refreshLocation, loading, error, address } = useLocation();

  useEffect(() => {
    if (!position) {
      refreshLocation();
    }
  }, [position, refreshLocation]);

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.content}>
          <p className={styles.tag}>🗺️ CARTE INTERACTIVE</p>
          <h2 className={styles.title}>Véhicules proches de votre position</h2>
          <p className={styles.description}>
            Géolocalisation automatique activée. Cliquez sur "Rafraîchir" pour mettre à jour.
          </p>
          
          <div className={styles.status}>
            {loading && <span>⏳ Détection position...</span>}
            {error && <span className={styles.error}>❌ {error}</span>}
            {position && <span>✅ {address}</span>}
          </div>

          <button onClick={refreshLocation} className={styles.refreshBtn} disabled={loading}>
            🔄 Rafraîchir position
          </button>
        </div>

        <div className={styles.mapContainer}>
          <MapContainer 
            center={position || [48.8566, 2.3522]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            className={styles.map}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} />
            {mockVehicles.map((vehicle) => (
              <Marker key={vehicle.id} position={[vehicle.lat, vehicle.lng]}>
                <Popup>
                  <strong>{vehicle.model}</strong><br />
                  {vehicle.price} <br />
                  <button className={styles.popupBtn}>Réserver</button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </section>
  );
};

export default LocationSearch;
