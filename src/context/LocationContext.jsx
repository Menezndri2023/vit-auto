import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
};

export const LocationProvider = ({ children }) => {
  const [position, setPosition] = useState(null);
  const [address, setAddress] = useState('Paris, France');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
      const data = await response.json();
      return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const addr = await reverseGeocode(lat, lng);
          setPosition({ lat, lng });
          setAddress(addr);
          setLoading(false);
        },
        (err) => {
          console.error('Geo error:', err);
          setError('Géolocalisation refusée');
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setError('Géolocalisation non supportée');
      setLoading(false);
    }
  }, [reverseGeocode]);

  const refreshLocation = useCallback(() => getCurrentLocation(), [getCurrentLocation]);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  return (
    <LocationContext.Provider value={{ position, address, loading, error, refreshLocation }}>
      {children}
    </LocationContext.Provider>
  );
};
