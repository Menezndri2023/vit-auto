import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { vehicles as initialVehicles } from "../data/vehicles";

const VehicleContext = createContext(null);

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
  const [drivers, setDrivers] = useState([]);
  const [bookings, setBookings] = useState(() => loadBookings());

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const response = await fetch("/api/vehicles");
        if (!response.ok) throw new Error("Failed to fetch vehicles");
        const data = await response.json();
        if (Array.isArray(data)) setVehicles(data);
      } catch {
        // Keep local fixture when backend is unavailable
      }
    };
    loadVehicles();
  }, []);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const response = await fetch("/api/drivers");
        if (!response.ok) throw new Error("Failed to fetch drivers");
        const data = await response.json();
        if (Array.isArray(data)) setDrivers(data);
      } catch {
        // Fallback empty
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
    const pending = { ...newVehicle, status: "pending" };
    setVehicles((prev) => [...prev, pending]);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers,
        body: JSON.stringify(pending),
      });
      if (!response.ok) throw new Error("Unable to add vehicle");
      const saved = await response.json();
      setVehicles((prev) => prev.map((v) => (v.id === newVehicle.id ? saved : v)));
    } catch {
      // fallback to local state only
    }
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

  const value = useMemo(
    () => ({
      vehicles,
      drivers,
      bookings,
      getItemById,
      addVehicle,
      addDriver,
      addBooking,
      removeBooking,
      approveVehicle,
      approveDriver,
    }),
    [vehicles, drivers, bookings]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};

