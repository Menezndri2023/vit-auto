import React, { createContext, useContext, useMemo, useState } from "react";
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
  const [vehicles] = useState(initialVehicles);
  const [bookings, setBookings] = useState(() => loadBookings());

  const getVehicleById = (id) => vehicles.find((v) => v.id === Number(id));

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
    () => ({ vehicles, bookings, getVehicleById, addBooking, removeBooking }),
    [vehicles, bookings]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};
