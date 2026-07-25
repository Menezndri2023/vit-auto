import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const CartContext = createContext(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};

const STORAGE_KEY = "vit_cart_v1";
const MAX_ITEMS = 8; // cohérent avec MAX_BATCH_ITEMS côté serveur (bookingController.createBookingsBatch)

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Panier "réservation location multiple" — volontairement séparé du parcours
// détaillé /booking/:id (options, financement, paiement en ligne) : on
// n'y stocke que ce qui est nécessaire pour créer plusieurs réservations
// "retrait" simples en une fois (voir POST /api/bookings/batch). Un client qui
// a besoin d'options fines repasse par le parcours véhicule par véhicule.
export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* quota plein — tant pis */ }
  }, [items]);

  const isInCart = useCallback((vehicleId) => items.some((it) => it.vehicleId === String(vehicleId)), [items]);

  const addItem = useCallback((vehicle) => {
    const vehicleId = String(vehicle._id || vehicle.id);
    let result = { ok: true };
    setItems((prev) => {
      if (prev.some((it) => it.vehicleId === vehicleId)) { result = { ok: false, message: "Déjà dans le panier." }; return prev; }
      if (prev.length >= MAX_ITEMS) { result = { ok: false, message: `Maximum ${MAX_ITEMS} véhicules par panier.` }; return prev; }
      return [...prev, {
        vehicleId,
        title: vehicle.title || [vehicle.marque, vehicle.modele].filter(Boolean).join(" ") || "Véhicule",
        image: vehicle.thumbnail || vehicle.image || (Array.isArray(vehicle.images) ? vehicle.images[0] : null) || null,
        pricePerDay: vehicle.pricePerDay || 0,
        ville: vehicle.ville || vehicle.city || null,
        startDate: "",
        endDate: "",
      }];
    });
    return result;
  }, []);

  const removeItem = useCallback((vehicleId) => {
    setItems((prev) => prev.filter((it) => it.vehicleId !== String(vehicleId)));
  }, []);

  const updateItemDates = useCallback((vehicleId, { startDate, endDate }) => {
    setItems((prev) => prev.map((it) => it.vehicleId === String(vehicleId)
      ? { ...it, ...(startDate !== undefined ? { startDate } : {}), ...(endDate !== undefined ? { endDate } : {}) }
      : it));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items, count: items.length, isInCart, addItem, removeItem, updateItemDates, clear, maxItems: MAX_ITEMS,
  }), [items, isInCart, addItem, removeItem, updateItemDates, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
