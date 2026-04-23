import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { vehicles as initialVehicles } from "../data/vehicles";

const VehicleContext = createContext(null);

// Normalize a vehicle from the MongoDB backend to match frontend field expectations
const normalizeVehicle = (v) => {
  if (!v || !v._id) return v; // Local fixture data already in correct format
  return {
    ...v,
    id:           v._id?.toString() || v.id,
    name:         v.title || `${v.marque || ""} ${v.modele || ""}`.trim() || "Véhicule",
    image:        (Array.isArray(v.images) && v.images[0]) || v.image || null,
    mode:         v.type === "vente" ? "Acheter" : "Louer",
    type:         v.vehicleType || "Voiture",
    fuel:         v.carburant || "",
    seats:        v.nombrePlaces ?? 5,
    buyPrice:     v.priceForSale,
    description:  v.description || "",
    transmission: v.transmission || "",
    // Champ original préservé pour les filtres internes
    listingType:  v.type,
  };
};

export const useVehicles = () => {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error("useVehicles must be used within VehicleProvider");
  return ctx;
};

const STORAGE_KEY = "vit-auto-bookings";

const loadBookings = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveBookings = (bookings) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // ignore
  }
};

export const VehicleProvider = ({ children }) => {
  const { token } = useAuth();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [partnerVehicles, setPartnerVehicles] = useState([]); // Partner's own vehicles (all statuses)
  const [drivers, setDrivers] = useState([]);
  const [bookings, setBookings] = useState(() => loadBookings());

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const response = await fetch("/api/vehicles");
        if (!response.ok) throw new Error("Failed to fetch vehicles");
        const data = await response.json();
        if (Array.isArray(data)) setVehicles(data.map(normalizeVehicle));
      } catch {
        // Keep local fixture when backend is unavailable
      }
    };
    loadVehicles();
  }, []);

  // Load the partner's own vehicles (pending + approved + rejected)
  const loadPartnerVehicles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/vehicles/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.vehicles) setPartnerVehicles(data.vehicles.map(normalizeVehicle));
    } catch {}
  }, [token]);

  useEffect(() => {
    loadPartnerVehicles();
  }, [loadPartnerVehicles]);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const response = await fetch("/api/drivers");
        if (!response.ok) {
          setDrivers([]);
          return;
        }
        const data = await response.json();
        if (Array.isArray(data)) setDrivers(data);
      } catch {
        setDrivers([]);
      }
    };
    loadDrivers();
  }, []);

  const getItemById = (id) => {
    const sid = String(id);
    return (
      vehicles.find((v) => v._id === sid || String(v.id) === sid) ||
      drivers.find((d) => d._id === sid || String(d.id) === sid)
    );
  };

  const addVehicle = async (newVehicle) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch("/api/vehicles", {
      method: "POST",
      headers,
      body: JSON.stringify(newVehicle),
    });
    if (!response.ok) throw new Error("Unable to add vehicle");
    const data = await response.json();
    const saved = normalizeVehicle(data.vehicle || data);
    // Always add to partner's own listing
    setPartnerVehicles((prev) => [saved, ...prev]);
    // If auto-approved, also add to public catalogue
    if (saved.status === "approved" && saved.available !== false) {
      setVehicles((prev) => [saved, ...prev]);
    }
    return saved;
  };

  const addDriver = async (newDriver) => {
    const pending = { ...newDriver, status: "pending" };
    setDrivers((prev) => [...prev, pending]);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/drivers", {
        method: "POST",
        headers,
        body: JSON.stringify(pending),
      });
      if (!response.ok) throw new Error("Unable to add driver");
      const saved = await response.json();
      setDrivers((prev) => prev.map((d) => (d.id === newDriver.id ? saved : d)));
    } catch {
      // fallback
    }
  };

  const approveVehicle = async (id) => {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/vehicles/${id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "approved" }),
      });
      if (!response.ok) throw new Error("Failed");
      const vehicle = await response.json();
      setVehicles((prev) => prev.map((v) => (v._id === vehicle._id || v.id === vehicle._id ? { ...v, status: "approved" } : v)));
      return vehicle;
    } catch {
      return null;
    }
  };

  const approveDriver = async (id) => {
    // Similar for drivers if needed
    return null;
  };

  const addBooking = (booking) => {
    const next = [...bookings, booking];
    setBookings(next);
    saveBookings(next);
  };

  const removeBooking = (id) => {
    const next = bookings.filter((b) => b.id !== id);
    setBookings(next);
    saveBookings(next);
  };

  // Met à jour le statut d'une commande (ex: "confirmed", "cancelled", "completed")
  const updateBookingStatus = (id, status, note = "") => {
    const next = bookings.map((b) =>
      String(b.id) === String(id) ? { ...b, status, vendorNote: note } : b
    );
    setBookings(next);
    saveBookings(next);
    // Sync backend si disponible
    if (token) {
      fetch(`/api/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, note }),
      }).catch(() => {});
    }
  };

  const value = useMemo(
    () => ({
      vehicles,
      partnerVehicles,
      drivers,
      bookings,
      getItemById,
      addVehicle,
      addDriver,
      addBooking,
      removeBooking,
      updateBookingStatus,
      approveVehicle,
      approveDriver,
      loadPartnerVehicles,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, partnerVehicles, drivers, bookings, loadPartnerVehicles]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};

