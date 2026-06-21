import React, { createContext, useContext, useState, useCallback } from 'react';

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocation must be used within LocationProvider');
  return context;
};

export const LocationProvider = ({ children }) => {
  const [position, setPosition] = useState(null);
  const [address,  setAddress]  = useState(null);   // null = pas encore détecté
  const [loading,  setLoading]  = useState(false);  // ne pas bloquer le rendu initial
  const [error,    setError]    = useState(null);

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`,
        { headers: { 'Accept-Language': 'fr' } }
      );
      const data = await res.json();
      // Format court : "Ville, Pays"
      const city    = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
      const country = data.address?.country || "";
      return city && country ? `${city}, ${country}` : (data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée par ce navigateur');
      return;
    }
    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat  = pos.coords.latitude;
          const lng  = pos.coords.longitude;
          const addr = await reverseGeocode(lat, lng);
          setPosition({ lat, lng });
          setAddress(addr);
          setLoading(false);
          resolve({ lat, lng, address: addr });
        },
        (err) => {
          const msgs = {
            1: 'Permission de géolocalisation refusée',
            2: 'Position non disponible',
            3: 'Délai d\'attente GPS dépassé',
          };
          setError(msgs[err.code] || 'Géolocalisation indisponible');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, [reverseGeocode]);

  const refreshLocation = useCallback(() => getCurrentLocation(), [getCurrentLocation]);

  // Ne pas déclencher automatiquement : l'utilisateur choisit quand utiliser sa position

  return (
    <LocationContext.Provider value={{ position, address, loading, error, refreshLocation }}>
      {children}
    </LocationContext.Provider>
  );
};
