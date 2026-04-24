import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { vehicles as initialVehicles } from "../data/vehicles";

// Convertit une commande MongoDB (backend) en format plat utilisé par les dashboards
const normalizeBackendBooking = (b) => {
  const pos = b.location?.pickupPosition;
  const hasGps = pos && pos.lat != null && pos.lng != null;
  const veh = b.vehicle;
  return {
    id:            b._id?.toString(),
    createdAt:     b.createdAt,
    status:        b.status,
    type:          b.type,
    vehicleName:   veh
      ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ")
      : "Véhicule",
    vehicleId:     veh?._id?.toString() || (typeof veh === "string" ? veh : null),
    // Client
    firstName:     b.clientInfo?.firstName,
    lastName:      b.clientInfo?.lastName,
    email:         b.clientInfo?.email,
    phone:         b.clientInfo?.phone,
    // Location
    startDate:     b.location?.startDate,
    endDate:       b.location?.endDate,
    days:          b.location?.days,
    pickupLocation: b.location?.pickupLocation,
    pickupMethod:  b.location?.pickupLocation ? "livraison" : "retrait",
    pickupAddress: pos?.address || b.location?.pickupLocation,
    pickupLat:     hasGps ? pos.lat : null,
    pickupLng:     hasGps ? pos.lng : null,
    returnLocation: b.location?.returnLocation,
    selectedOptions: b.location?.options || {},
    // Essai
    preferredDate: b.essai?.preferredDate,
    preferredTime: b.essai?.preferredTime,
    notes:         b.essai?.notes || b.chauffeur?.notes,
    // Finances
    total:         b.montantTotal,
    baseTotal:     b.montantBase,
    optionsTotal:  b.montantOptions,
    serviceFeeFCFA: b.serviceFeeFCFA ?? 1000,
    partnerPayout: b.partnerPayout,
    pricePerDay:   veh?.pricePerDay,
    // Vérif & paiement
    clientVerification: b.clientVerification,
    paidWith:      b.payment?.method,
    isPaid:        b.isPaid,
    vendorNote:    b.cancelReason,
    _fromBackend:  true,
  };
};

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

// eslint-disable-next-line react-refresh/only-export-components
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
  const [partnerVehicles, setPartnerVehicles] = useState([]);
  const [partnerBookings, setPartnerBookings] = useState([]); // Commandes reçues (partenaire) — depuis backend
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
    } catch { /* backend unavailable */ }
  }, [token]);

  // Commandes reçues par le partenaire (depuis le backend — inclut les coords GPS)
  const loadPartnerOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/bookings/partner", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) setPartnerBookings(raw.map(normalizeBackendBooking));
    } catch { /* backend unavailable */ }
  }, [token]);

  // Commandes du client connecté (synchronise le localStorage avec le backend)
  const loadMyOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/bookings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) {
        const normalized = raw.map(normalizeBackendBooking);
        setBookings((prev) => {
          const ids = new Set(normalized.map((b) => b.id));
          return [...normalized, ...prev.filter((b) => !ids.has(String(b.id)))];
        });
      }
    } catch { /* backend unavailable */ }
  }, [token]);

  useEffect(() => {
    loadPartnerVehicles();
  }, [loadPartnerVehicles]);

  useEffect(() => {
    loadPartnerOrders();
  }, [loadPartnerOrders]);

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

  const approveDriver = async () => {
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

  // Met à jour le statut d'une commande (localStorage + partnerBookings + backend)
  const updateBookingStatus = useCallback((id, status, note = "") => {
    const sid = String(id);
    setBookings((prev) => {
      const next = prev.map((b) => String(b.id) === sid ? { ...b, status, vendorNote: note } : b);
      saveBookings(next);
      return next;
    });
    setPartnerBookings((prev) =>
      prev.map((b) => String(b.id) === sid ? { ...b, status, vendorNote: note } : b)
    );
    if (token) {
      fetch(`/api/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, cancelReason: note }),
      }).catch(() => {});
    }
  }, [token]);

  const value = useMemo(
    () => ({
      vehicles,
      partnerVehicles,
      partnerBookings,
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
      loadPartnerOrders,
      loadMyOrders,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, partnerVehicles, partnerBookings, drivers, bookings, loadPartnerVehicles, loadPartnerOrders, loadMyOrders, updateBookingStatus]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};

