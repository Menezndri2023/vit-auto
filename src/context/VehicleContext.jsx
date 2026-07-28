import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { vehicles as initialVehicles } from "../data/vehicles";

// Convertit une commande MongoDB (backend) en format plat utilisé par les dashboards
const normalizeBackendBooking = (b) => {
  const pos = b.location?.pickupPosition;
  const hasGps = pos && pos.lat != null && pos.lng != null;
  const veh = b.vehicle;
  const drv = b.driver;
  return {
    id:            b._id?.toString(),
    createdAt:     b.createdAt,
    updatedAt:     b.updatedAt,
    status:        b.status,
    type:          b.type,
    reference:     b.reference,
    vehicleName:   veh
      ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ")
      : (drv ? `${drv.firstName || ""} ${drv.lastName || ""}`.trim() : "Véhicule"),
    vehicleId:     veh?._id?.toString() || (typeof veh === "string" ? veh : null),
    vehicleMode:   veh?.type === "vente" ? "Acheter" : (veh?.type || null),
    // Client
    firstName:     b.clientInfo?.firstName,
    lastName:      b.clientInfo?.lastName,
    email:         b.clientInfo?.email,
    phone:         b.clientInfo?.phone,
    clientInfo:    b.clientInfo,
    clientVerification: b.clientVerification,
    clientKycSnapshot: b.clientKycSnapshot,
    partnerKycVerification: b.partnerKycVerification,
    // Location
    location:      b.location,
    startDate:     b.location?.startDate,
    endDate:       b.location?.endDate,
    days:          b.location?.days,
    pickupLocation: b.location?.pickupLocation,
    pickupMethod:  b.location?.pickupMethod
      || (b.location?.pickupPosition?.lat != null ? "livraison"
          : b.location?.pickupLocation && !b.location.pickupLocation.startsWith("Retrait") ? "livraison"
          : "retrait"),
    pickupAddress: pos?.address || b.location?.pickupLocation,
    pickupLat:     hasGps ? pos.lat : null,
    pickupLng:     hasGps ? pos.lng : null,
    returnLocation: b.location?.returnLocation,
    selectedOptions: b.location?.options || {},
    deliveryFee:   b.location?.deliveryFee,
    // Essai
    essai:         b.essai,
    preferredDate: b.essai?.preferredDate,
    preferredTime: b.essai?.preferredTime,
    notes:         b.essai?.notes || b.chauffeur?.notes,
    // Chauffeur
    chauffeur:     b.chauffeur,
    // Leasing
    leasing:       b.leasing,
    // Finances
    montantTotal:  b.montantTotal,
    montantBase:   b.montantBase,
    montantOptions: b.montantOptions,
    total:         b.montantTotal,
    baseTotal:     b.montantBase,
    optionsTotal:  b.montantOptions,
    serviceFeeFCFA: b.serviceFeeFCFA ?? 1000,
    commissionRate:    b.commissionRate,
    commissionAmount:  b.commissionAmount,
    partnerPayout:     b.partnerPayout,
    cautionAmount:     b.cautionAmount,
    cautionClaim:      b.cautionClaim,
    pricePerDay:       veh?.pricePerDay,
    // Paiement & transaction
    paidWith:      b.payment?.method,
    isPaid:        b.isPaid,
    paidAt:        b.paidAt,
    transaction:   b.transaction,
    clientValidation: b.clientValidation,
    // Annulation
    cancelReason:  b.cancelReason,
    cancelledAt:   b.cancelledAt,
    vendorNote:    b.cancelReason,
    // Contrat
    contract:      b.contract?._id || b.contract,
    // Contact partenaire (pour appel depuis le dashboard client)
    partnerPhone:  veh?.contactTel || drv?.phone || null,
    partnerName:   veh?.contactNom || (drv ? `${drv.firstName} ${drv.lastName}` : null),
    _fromBackend:  true,
  };
};

const VehicleContext = createContext(null);

// Normalize a vehicle from the MongoDB backend to match frontend field expectations
const normalizeVehicle = (v) => {
  if (!v || !v._id) return v; // Local fixture data already in correct format
  // Extraire l'ID propriétaire quel que soit le format (populate ou ref)
  const ownerId = v.owner?._id?.toString()
    || (typeof v.owner === "string" ? v.owner : null)
    || v.ownerId?.toString()
    || null;
  const ownerName = v.owner?.firstName
    ? `${v.owner.firstName} ${v.owner.lastName || ""}`.trim()
    : v.contactNom || v.partnerName || null;

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
    listingType:  v.type,
    leasing:      v.leasing || null,
    credit:       v.credit  || null,
    promotions:   v.promotions || [],
    // Partenaire — pour affichage et lien profil
    ownerId,
    ownerName,
    ownerPhone:   v.owner?.phone || v.contactTel || null,
    ownerCity:            v.owner?.city  || v.ville || null,
    // Concessionnaire = attribut de l'ENTITÉ (PartnerBusiness.isConcessionnaire),
    // pas du compte partenaire — seule getVehicleById peuple `business` (populate),
    // absent en liste catalogue (v.business y reste un simple ObjectId ou absent).
    isConcessionnaire:    !!(v.business && typeof v.business === "object" && v.business.isConcessionnaire),
    certificationBadge:  v.owner?.certificationBadge || null,
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
    const parsed = JSON.parse(raw);
    // Migration : ajouter status manquant aux anciennes commandes
    return parsed.map((b) => (!b.status ? { ...b, status: "À confirmer" } : b));
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
  const { token, user, authReady } = useAuth();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [partnerVehicles, setPartnerVehicles] = useState([]);
  const [partnerBookings, setPartnerBookings] = useState([]); // Commandes reçues (partenaire) — depuis backend
  const [drivers, setDrivers] = useState([]);
  const [bookings, setBookings] = useState(() => loadBookings());
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  const loadVehicles = useCallback(async (page = 1, append = false) => {
    setVehiclesLoading(true);
    try {
      const response = await fetch(`/api/vehicles?limit=50&page=${page}`);
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      const data = await response.json();
      // Gère l'ancien format (tableau) et le nouveau format paginé ({ vehicles, total })
      const list = Array.isArray(data) ? data : (data.vehicles || []);
      const normalized = list.map(normalizeVehicle);
      setVehicles((prev) => append ? [...prev, ...normalized] : normalized);
    } catch {
      // Keep local fixture when backend is unavailable
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    // Différé après le premier rendu (requestIdleCallback) pour ne pas faire concurrence
    // aux ressources critiques du premier affichage (JS/CSS/police/image LCP) sur TOUTES
    // les routes, y compris celles qui n'affichent aucun véhicule (login, profil, kyc...).
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => loadVehicles());
    return () => cancelIdle(id);
  }, [loadVehicles]);

  // Véhicules mis en avant par un admin (carousel d'accueil/"Véhicules en
  // vedette") — bug réel corrigé (audit) : ce n'était jusqu'ici JAMAIS une
  // vraie sélection admin (featured n'existait même pas sur le schéma), juste
  // les premiers véhicules disponibles de la page 1 du catalogue général,
  // qui aurait aussi pu en manquer des vrais si le catalogue dépasse 50
  // annonces. Requête backend dédiée, filtrée strictement sur featured:true.
  const [featuredVehicles, setFeaturedVehicles] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const loadFeaturedVehicles = useCallback(async () => {
    setFeaturedLoading(true);
    try {
      const response = await fetch("/api/vehicles?featured=true&limit=12");
      if (!response.ok) return;
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.vehicles || []);
      setFeaturedVehicles(list.map(normalizeVehicle));
    } catch {
      // Section vide si le backend est indisponible — jamais de repli sur
      // des véhicules non curatés par un admin.
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => loadFeaturedVehicles());
    return () => cancelIdle(id);
  }, [loadFeaturedVehicles]);

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
  // businessId optionnel : segmente par entité (PartnerBusiness) pour un
  // partenaire qui en gère plusieurs — voir bookingController.getPartnerBookings.
  const loadPartnerOrders = useCallback(async (businessId) => {
    if (!token) return;
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const res = await fetch(`/api/bookings/partner${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) setPartnerBookings(raw.map(normalizeBackendBooking));
    } catch { /* backend unavailable */ }
  }, [token]);

  // Commandes du client connecté — le backend est la source de vérité
  // Les commandes locales (id numérique = timestamp) sont conservées seulement si
  // elles n'ont pas encore été synchronisées (hors ligne)
  const loadMyOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/bookings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) {
        const fromBackend = raw.map(normalizeBackendBooking);
        const backendIds  = new Set(fromBackend.map((b) => String(b.id)));
        setBookings((prev) => {
          // Garder les commandes locales (id numérique) UNIQUEMENT si elles ne sont pas encore
          // présentes dans le backend (évite doublons et entrées orphelines)
          const localOnly = prev.filter(
            (b) => !b._fromBackend && typeof b.id === "number" && !backendIds.has(String(b.id))
          );
          const merged = [...fromBackend, ...localOnly];
          saveBookings(merged);
          return merged;
        });
      }
    } catch { /* backend unavailable — conserver les données locales */ }
  }, [token]);

  useEffect(() => {
    if (authReady && (user?.role === "partenaire" || user?.role === "admin")) {
      loadPartnerVehicles();
    }
  }, [authReady, loadPartnerVehicles, user?.role]);

  useEffect(() => {
    if (authReady && (user?.role === "partenaire" || user?.role === "admin")) {
      loadPartnerOrders();
    }
  }, [authReady, loadPartnerOrders, user?.role]);

  // Charger les commandes "client" de l'utilisateur connecté — pour TOUS les rôles
  // (un partenaire peut aussi avoir fait des réservations en tant que client)
  useEffect(() => {
    if (authReady && token) {
      loadMyOrders();
    }
  }, [authReady, loadMyOrders, token]);

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
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = idle(loadDrivers);
    return () => cancelIdle(id);
  }, []);

  const getItemById = (id) => {
    const sid = String(id);
    return (
      vehicles.find((v) => v._id === sid || String(v.id) === sid) ||
      partnerVehicles.find((v) => v._id === sid || String(v.id) === sid) ||
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
    if (!response.ok) {
      // Remonter le vrai message/code backend (ex: CERTIFICATION_REQUIRED) plutôt
      // qu'une erreur générique — le 413 (photos trop volumineuses) ne renvoie pas
      // de JSON, d'où le fallback.
      const data = await response.json().catch(() => null);
      const err = new Error(data?.message || `Erreur serveur (${response.status}).`);
      if (data?.code) err.code = data.code;
      throw err;
    }
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

  // PATCH /api/vehicles/:id — édition d'une annonce déjà publiée (le serveur
  // n'accepte que les champs de la whitelist EDITABLE, voir vehicleController.js).
  const updateVehicle = async (id, patch) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || `Erreur serveur (${response.status}).`);
    const saved = normalizeVehicle(data.vehicle || data);
    setPartnerVehicles((prev) => prev.map((v) => (v._id === saved._id || String(v.id) === String(saved.id)) ? saved : v));
    setVehicles((prev) => prev.map((v) => (v._id === saved._id || String(v.id) === String(saved.id)) ? saved : v));
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

  const approveDriver = useCallback(async (id, status = "approved") => {
    try {
      if (!token) return null;
      const res = await fetch(`/api/drivers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const updated = data.driver || data;
      setDrivers((prev) => prev.map((d) =>
        (d._id === updated._id || d._id === id) ? { ...d, status } : d
      ));
      return updated;
    } catch {
      return null;
    }
  }, [token]);

  const addBooking = (booking) => {
    const next = [...bookings, booking];
    setBookings(next);
    saveBookings(next);
    // Resync immédiat avec le backend pour récupérer la vraie réservation (avec id MongoDB, statut, etc.)
    if (token) setTimeout(() => loadMyOrders(), 1500);
  };

  // reasonCode obligatoire (voir constants/bookingCancelReasons.js — liste
  // CLIENT_CANCEL_REASONS) ; reason = texte libre facultatif. Retourne
  // { ok, message } — même pattern que updateBookingStatus ci-dessous (rollback
  // si le backend refuse, jamais d'échec avalé en silence).
  const removeBooking = useCallback(async (id, reasonCode, reason = "") => {
    const sid = String(id);
    let prevBookings;
    setBookings((prev) => {
      prevBookings = prev;
      const next = prev.map((b) =>
        String(b.id) === sid || String(b._id) === sid ? { ...b, status: "cancelled" } : b
      );
      saveBookings(next);
      return next;
    });

    if (!token) return { ok: true };

    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reasonCode, reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (prevBookings) { setBookings(prevBookings); saveBookings(prevBookings); }
        return { ok: false, message: d.message || "Impossible d'annuler la réservation." };
      }
      return { ok: true };
    } catch {
      if (prevBookings) { setBookings(prevBookings); saveBookings(prevBookings); }
      return { ok: false, message: "Erreur réseau — la réservation n'a pas été annulée." };
    }
  }, [token]);

  // Met à jour le statut d'une commande (localStorage + partnerBookings + backend).
  // Retourne { ok, message } — mise à jour optimiste annulée (rollback) si le
  // backend refuse (ex: 409 "financement non accepté", voir bookingController
  // updateBookingStatus) ; avant ce correctif l'échec était avalé en silence
  // (fetch().catch(() => {})) et l'appelant affichait quand même un toast de
  // succès, laissant le partenaire croire que le changement avait eu lieu.
  const updateBookingStatus = useCallback(async (id, status, note = "", cancelReasonCode = null) => {
    const sid = String(id);
    const validStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "client_absent",
      "transaction_concluded", "transaction_not_concluded",
      "waiting_client_validation",
      "completed", "cancelled", "disputed",
    ];
    if (!validStatuses.includes(status)) return { ok: false, message: "Statut invalide." };

    let prevBookings, prevPartnerBookings;
    setBookings((prev) => {
      prevBookings = prev;
      const next = prev.map((b) => String(b.id) === sid ? { ...b, status, vendorNote: note } : b);
      saveBookings(next);
      return next;
    });
    setPartnerBookings((prev) => {
      prevPartnerBookings = prev;
      return prev.map((b) => String(b.id) === sid ? { ...b, status, vendorNote: note } : b);
    });

    if (!token) return { ok: true };

    const rollback = () => {
      if (prevBookings) { setBookings(prevBookings); saveBookings(prevBookings); }
      if (prevPartnerBookings) setPartnerBookings(prevPartnerBookings);
    };

    try {
      const res = await fetch(`/api/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, cancelReason: note, cancelReasonCode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        rollback();
        return { ok: false, message: d.message || "Impossible de mettre à jour le statut." };
      }
      return { ok: true };
    } catch {
      rollback();
      return { ok: false, message: "Erreur réseau — le statut n'a pas été mis à jour." };
    }
  }, [token]);

  const value = useMemo(
    () => ({
      vehicles,
      vehiclesLoading,
      featuredVehicles,
      featuredLoading,
      partnerVehicles,
      partnerBookings,
      drivers,
      bookings,
      getItemById,
      addVehicle,
      updateVehicle,
      addDriver,
      addBooking,
      removeBooking,
      updateBookingStatus,
      approveVehicle,
      approveDriver,
      loadPartnerVehicles,
      loadPartnerOrders,
      loadMyOrders,
      refreshVehicles: loadVehicles,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, vehiclesLoading, featuredVehicles, featuredLoading, partnerVehicles, partnerBookings, drivers, bookings, loadPartnerVehicles, loadPartnerOrders, loadMyOrders, updateBookingStatus, loadVehicles]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
};

