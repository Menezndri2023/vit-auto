import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Booking.module.css";

/* ══════════════════════════════════════════════════════════
   VALIDATION PIÈCE D'IDENTITÉ — Formats par pays & type
   ══════════════════════════════════════════════════════════ */

const ID_RULES = {
  cni: {
    label: "Carte Nationale d'Identité (CNI)",
    patterns: [
      // Maroc
      { regex: /^[A-Z]{1,2}\d{5,7}$/i,   country: "🇲🇦 Maroc",         example: "B123456 ou AB123456" },
      // France
      { regex: /^\d{12}$/,                country: "🇫🇷 France",         example: "123456789012 (12 chiffres)" },
      // Côte d'Ivoire
      { regex: /^\d{9,12}$/,              country: "🇨🇮 Côte d'Ivoire",  example: "CI-XXXXXXXX ou 9-12 chiffres" },
      { regex: /^CI[-\s]?\d{8,10}$/i,    country: "🇨🇮 Côte d'Ivoire",  example: "CI-12345678" },
      // Sénégal
      { regex: /^\d{10,13}$/,             country: "🇸🇳 Sénégal",        example: "1234567890123" },
      // Algérie
      { regex: /^\d{18}$/,                country: "🇩🇿 Algérie",        example: "18 chiffres" },
      // Tunisie
      { regex: /^\d{8}$/,                 country: "🇹🇳 Tunisie",        example: "12345678 (8 chiffres)" },
      // Mali, Burkina, etc.
      { regex: /^[A-Z0-9]{6,16}$/i,      country: "🌍 Afrique de l'Ouest", example: "6 à 16 caractères" },
    ],
    minLength: 5,
    maxLength: 20,
    hint: "Exemple Maroc : B123456 ou AB123456 — France : 12 chiffres",
  },
  passport: {
    label: "Passeport",
    patterns: [
      // Maroc / International OACI standard
      { regex: /^[A-Z]{2}\d{7}[A-Z0-9]?$/i, country: "🌍 Standard international", example: "AB1234567" },
      // Maroc format court
      { regex: /^[A-Z]\d{7}$/i,              country: "🇲🇦 Maroc",                 example: "A1234567" },
      // France
      { regex: /^\d{9}$/,                    country: "🇫🇷 France",                example: "123456789 (9 chiffres)" },
      // Format OACI relaxé
      { regex: /^[A-Z0-9]{6,9}$/i,           country: "🌍 International",           example: "6 à 9 caractères" },
    ],
    minLength: 6,
    maxLength: 12,
    hint: "Maroc : A1234567 ou AB1234567 — France : 9 chiffres",
  },
  permis: {
    label: "Permis de conduire",
    patterns: [
      // Maroc
      { regex: /^[A-Z]{1,2}\d{5,7}$/i,   country: "🇲🇦 Maroc",   example: "AB123456" },
      // France
      { regex: /^\d{2}[A-Z0-9]{6,9}$/i,  country: "🇫🇷 France",  example: "75-XXXXXX" },
      { regex: /^[0-9A-Z\-]{6,15}$/i,    country: "🌍 Général",   example: "6 à 15 caractères" },
    ],
    minLength: 5,
    maxLength: 15,
    hint: "Maroc : AB123456 — France format région + chiffres",
  },
};

// Normaliser : retirer espaces, tirets multiples, mettre en majuscules
const normalize = (str) => str.replace(/\s+/g, "").replace(/-+/g, "-").toUpperCase().trim();

// Valider la pièce d'identité
function validateId(type, number) {
  const n = normalize(number);
  const rules = ID_RULES[type];
  if (!rules) return { status: "error", message: "Type de document invalide." };
  if (!n) return { status: "empty", message: "" };
  if (n.length < rules.minLength) {
    return {
      status: "error",
      message: `Numéro trop court — minimum ${rules.minLength} caractères requis.`,
    };
  }
  if (n.length > rules.maxLength) {
    return { status: "error", message: `Numéro trop long — maximum ${rules.maxLength} caractères.` };
  }
  // Tester les patterns
  for (const pattern of rules.patterns) {
    if (pattern.regex.test(n)) {
      return {
        status: "valid",
        message: `Format reconnu — ${pattern.country}`,
        country: pattern.country,
        example: pattern.example,
      };
    }
  }
  // Format non reconnu mais longueur acceptable
  return {
    status: "warning",
    message: "Format inhabituel — vérifiez que le numéro est correct. Nous l'acceptons si vous êtes sûr(e).",
  };
}

// Valider le numéro de téléphone
function validatePhone(phone) {
  const p = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (!p) return { ok: false, message: "Téléphone requis." };

  const intlPrefixes = {
    "+212": "🇲🇦 Maroc",  "+225": "🇨🇮 Côte d'Ivoire",
    "+221": "🇸🇳 Sénégal", "+33":  "🇫🇷 France",
    "+32":  "🇧🇪 Belgique","+34":  "🇪🇸 Espagne",
    "+41":  "🇨🇭 Suisse",  "+1":   "🇺🇸 USA/Canada",
    "+44":  "🇬🇧 UK",      "+213": "🇩🇿 Algérie",
    "+216": "🇹🇳 Tunisie", "+223": "🇲🇱 Mali",
  };

  // Format international
  if (p.startsWith("+")) {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, message: "Numéro trop court ou trop long." };
    }
    for (const [prefix, country] of Object.entries(intlPrefixes)) {
      if (p.startsWith(prefix)) {
        return { ok: true, message: `${country}`, country };
      }
    }
    return { ok: true, message: "Format international reconnu." };
  }
  // Format local (commence par 0)
  if (p.startsWith("0")) {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 11) {
      return { ok: false, message: "Numéro local invalide (9-11 chiffres attendus)." };
    }
    return { ok: true, message: "Numéro local — Ajoutez l'indicatif +XXX pour plus de précision." };
  }
  return { ok: false, message: "Format invalide. Commencez par + (international) ou 0 (local)." };
}

/* ── Constantes ───────────────────────────────────────────── */
const SERVICE_FEE     = 1000;   // FCFA fixe plateforme
const DELIVERY_BASE   = 1000;   // FCFA base livraison
const DELIVERY_PER_KM = 200;    // FCFA/km

const optionsData = [
  { id: "babySeat",  label: "Siège bébé",        price: 7000  },
  { id: "insurance", label: "Prime d'assurance", price: 15000 },
  { id: "driver",    label: "Chauffeur privé",   price: 50000 },
];

const gpsOption = { id: "gps", label: "GPS intégré", price: 10000 };

/* ── Haversine distance (km) ─────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Géocoder une adresse via Nominatim ─────────────────── */
async function geocodeAddress(address) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "Accept-Language": "fr" } }
    );
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
  } catch {}
  return null;
}

/* ── Reverse géocode (coordonnées → adresse) ────────────── */
async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "fr" } }
    );
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/* ── Obtenir la position GPS (Promise) ──────────────────── */
function getGPSPosition(timeout = 12000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Géolocalisation non supportée par votre navigateur."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new Error("Accès à la position refusé. Vérifiez les permissions de votre navigateur."));
        else if (err.code === 2) reject(new Error("Position indisponible. Vérifiez votre connexion."));
        else reject(new Error("Délai dépassé. Réessayez."));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

/* ═══════════════════════════════════════════════════════════ */
export default function Booking() {
  const { id }          = useParams();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const { fmt }         = useCurrency();
  const { vehicles: ctx } = useVehicles();
  const { vehicles, addBooking, getItemById } = useVehicles();
  const getVehicleById = getItemById
    || ((vid) => vehicles?.find((v) => String(v.id) === String(vid) || v._id === String(vid)));
  const { token, user } = useAuth();
  const vehicle = getVehicleById(id);

  const isLeasingRequest = searchParams.get("type") === "leasing";
  const isSaleMode       = vehicle?.mode === "Acheter";
  const isTrial          = isSaleMode && !isLeasingRequest;
  const isLeasing        = isSaleMode && isLeasingRequest && vehicle?.leasing?.disponible;

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [step,       setStep]       = useState(1);

  useEffect(() => {
    setLoading(true);
    if (!id) { setError("ID véhicule manquant."); setLoading(false); return; }
    if (!getVehicleById(id)) setError("Véhicule non trouvé. Retournez au catalogue.");
    setLoading(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Prise en charge ──────────────────────────────────── */
  const [pickupMethod,   setPickupMethod]   = useState("livraison");
  const [pickupAddress,  setPickupAddress]  = useState("");
  const [pickupPosition, setPickupPosition] = useState(null);

  // États GPS
  const [gpsState,  setGpsState]  = useState("idle"); // "idle"|"loading"|"ok"|"error"
  const [gpsError,  setGpsError]  = useState("");
  const gpsAbortRef = useRef(null);

  // Calcul frais livraison
  const [geoDistance,    setGeoDistance]    = useState(null);
  const [geoFee,         setGeoFee]         = useState(null);
  const [geoFeeLoading,  setGeoFeeLoading]  = useState(false);
  const [partnerGeoPos,  setPartnerGeoPos]  = useState(null);

  // Infos agence (retrait)
  const agencyName    = vehicle?.contactNom  || vehicle?.ownerName  || vehicle?.partnerName || "Partenaire VIT AUTO";
  const agencyPhone   = vehicle?.contactTel  || vehicle?.ownerPhone || null;
  const agencyCity    = vehicle?.ville       || vehicle?.ownerCity  || "";
  const agencyAddress = vehicle?.adresse     || "";
  const agencyFull    = [agencyAddress, agencyCity].filter(Boolean).join(", ");
  const mapsUrl       = agencyFull
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(agencyFull)}`
    : null;

  /* ── Détecter la position GPS ─────────────────────────── */
  const handleDetectGPS = async () => {
    setGpsState("loading");
    setGpsError("");
    setPickupAddress("");
    setPickupPosition(null);
    setGeoDistance(null);
    setGeoFee(null);

    try {
      const pos = await getGPSPosition();
      const addr = await reverseGeocode(pos.lat, pos.lng);
      setPickupPosition(pos);
      setPickupAddress(addr);
      setGpsState("ok");
    } catch (err) {
      setGpsState("error");
      setGpsError(err.message);
    }
  };

  /* ── Calculer frais dès que position client connue ─────── */
  useEffect(() => {
    if (!pickupPosition || pickupMethod !== "livraison") {
      setGeoDistance(null);
      setGeoFee(null);
      return;
    }
    const partnerAddr = agencyFull;

    const compute = async () => {
      setGeoFeeLoading(true);

      // 1. Essai via backend
      try {
        const res = await fetch(
          `/api/geo/delivery-fee?clientLat=${pickupPosition.lat}&clientLng=${pickupPosition.lng}&vehicleId=${vehicle?._id || vehicle?.id || ""}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.fee != null && data.distanceKm != null) {
            setGeoDistance(data.distanceKm);
            setGeoFee(data.fee);
            setGeoFeeLoading(false);
            return;
          }
        }
      } catch {}

      // 2. Fallback Haversine — géocoder l'adresse partenaire
      let pPos = partnerGeoPos;
      if (!pPos && partnerAddr.trim()) {
        pPos = await geocodeAddress(partnerAddr);
        if (pPos) setPartnerGeoPos(pPos);
      }
      if (pPos) {
        const km  = haversineKm(pickupPosition.lat, pickupPosition.lng, pPos.lat, pPos.lng);
        const fee = Math.round(DELIVERY_BASE + DELIVERY_PER_KM * km);
        setGeoDistance(parseFloat(km.toFixed(1)));
        setGeoFee(fee);
      } else {
        setGeoDistance(null);
        setGeoFee(3000); // fallback 3 km
      }
      setGeoFeeLoading(false);
    };
    compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPosition, pickupMethod]);

  /* ── Formulaires ──────────────────────────────────────── */
  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName:  user?.lastName  || "",
    email:     user?.email     || "",
    phone:     user?.phone     || "",
    startDate: "",
    endDate:   "",
  });

  const [trialForm, setTrialForm] = useState({
    firstName:     user?.firstName || "",
    lastName:      user?.lastName  || "",
    email:         user?.email     || "",
    phone:         user?.phone     || "",
    preferredDate: "",
    preferredTime: "",
    notes:         "",
  });

  const [verificationForm, setVerificationForm] = useState({
    idType: "cni", idNumber: "", address: "", agreeTerms: false,
  });

  // Validation temps réel pièce d'identité
  const [idValidation,   setIdValidation]   = useState({ status: "empty", message: "" });
  const [verifying,      setVerifying]      = useState(false);   // animation vérification
  const [verifyDone,     setVerifyDone]     = useState(false);   // vérification réussie
  const [verifyFailed,   setVerifyFailed]   = useState(false);
  const [phoneValidation, setPhoneValidation] = useState({ ok: null, message: "" });

  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: "orange",
    cardNumber: "", cardHolder: "", expiryDate: "", cvv: "", mobileNumber: "",
  });

  const [selectedOptions, setSelectedOptions] = useState({
    gps: false, babySeat: false, insurance: false, driver: false,
  });

  const gpsAutoIncluded = pickupMethod === "livraison";

  /* ── Calculs financiers ───────────────────────────────── */
  const days = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s) || isNaN(e)) return 0;
    const d = Math.ceil((e - s) / 86400000);
    return d > 0 ? d : 0;
  })();

  const allOptions = gpsAutoIncluded ? optionsData : [gpsOption, ...optionsData];
  const optionsTotal = Object.entries(selectedOptions).reduce((acc, [key, val]) => {
    if (!val) return acc;
    if (key === "gps" && gpsAutoIncluded) return acc;
    const opt = allOptions.find((o) => o.id === key);
    return acc + (opt?.price || 0) * Math.max(days, 1);
  }, 0);

  const deliveryFee = pickupMethod === "livraison" ? (geoFee ?? 3000) : 0;
  const baseTotal   = (vehicle?.pricePerDay || 0) * Math.max(days, 1);
  const totalToPay  = isTrial ? SERVICE_FEE : baseTotal + optionsTotal + deliveryFee + SERVICE_FEE;

  /* ── Handlers ──────────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name in selectedOptions) { setSelectedOptions({ ...selectedOptions, [name]: checked }); return; }
    if (name in form)            { setForm({ ...form, [name]: value }); return; }
    if (name in paymentForm)     { setPaymentForm({ ...paymentForm, [name]: value }); return; }
  };

  const handleVerifChange = (e) => {
    const { name, value, type: inputType, checked } = e.target;
    const next = { ...verificationForm, [name]: inputType === "checkbox" ? checked : value };
    setVerificationForm(next);
    setVerifyDone(false);
    setVerifyFailed(false);

    // Validation temps réel du numéro
    if (name === "idNumber" || name === "idType") {
      const num  = name === "idNumber" ? value : verificationForm.idNumber;
      const type = name === "idType"   ? value : verificationForm.idType;
      setIdValidation(validateId(type, num));
    }
  };

  // Vérifier le téléphone en temps réel
  const handlePhoneChange = useCallback((e) => {
    const val = e.target.value;
    const name = e.target.name;
    if (name === "phone") {
      setForm((prev) => ({ ...prev, phone: val }));
      setPhoneValidation(validatePhone(val));
    } else if (name === "phone" && isTrial) {
      setTrialForm((prev) => ({ ...prev, phone: val }));
      setPhoneValidation(validatePhone(val));
    }
  }, [isTrial]);

  // Lancer la vérification simulée (animation)
  const handleVerifyId = useCallback(async () => {
    const result = validateId(verificationForm.idType, verificationForm.idNumber);
    if (result.status === "error") {
      setIdValidation(result);
      return;
    }
    setVerifying(true);
    setVerifyDone(false);
    setVerifyFailed(false);

    // Simulation vérification (1.5s — dans un vrai projet : appel API gouvernemental)
    await new Promise((r) => setTimeout(r, 1600));

    // Accepté si format valid ou warning (on donne le bénéfice du doute sur le format inhabituel)
    if (result.status === "valid" || result.status === "warning") {
      setVerifyDone(true);
      setVerifyFailed(false);
    } else {
      setVerifyFailed(true);
      setVerifyDone(false);
    }
    setVerifying(false);
  }, [verificationForm.idType, verificationForm.idNumber]);

  const handleTrialChange = (e) => setTrialForm({ ...trialForm, [e.target.name]: e.target.value });

  const handleStepOneSubmit = (e) => {
    e.preventDefault();
    if (isTrial) {
      const req = ["firstName", "lastName", "email", "phone", "preferredDate", "preferredTime"];
      if (req.find((f) => !trialForm[f])) { alert("Remplissez tous les champs obligatoires."); return; }
    } else {
      if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.startDate || !form.endDate) {
        alert("Renseignez tous les champs de réservation."); return;
      }
      if (days <= 0) { alert("La date de fin doit être postérieure à la date de début."); return; }
      if (pickupMethod === "livraison" && !pickupAddress.trim()) {
        alert("Indiquez votre adresse de livraison (utilisez le bouton GPS ou saisissez l'adresse)."); return;
      }
    }
    setStep(2);
  };

  const handleVerifSubmit = (e) => {
    e.preventDefault();
    if (!verificationForm.idType || !verificationForm.idNumber) {
      alert("Veuillez fournir votre pièce d'identité."); return;
    }

    // Bloquer si format invalide
    const result = validateId(verificationForm.idType, verificationForm.idNumber);
    if (result.status === "error") {
      setIdValidation(result);
      alert("Le numéro de pièce d'identité est invalide. " + result.message);
      return;
    }

    // Bloquer si vérification non lancée ou échouée
    if (!verifyDone) {
      if (!verifying) {
        alert("Veuillez cliquer sur « Vérifier » pour confirmer votre pièce d'identité avant de continuer.");
      }
      return;
    }

    if (!verificationForm.agreeTerms) {
      alert("Vous devez accepter les conditions générales d'utilisation."); return;
    }

    setStep(3);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (paymentForm.paymentMethod === "card") {
      const req = ["cardNumber", "cardHolder", "expiryDate", "cvv"];
      if (req.find((f) => !paymentForm[f])) { alert("Renseignez les informations de carte."); return; }
    }
    if (["orange", "wave", "mtn", "moov"].includes(paymentForm.paymentMethod) && !paymentForm.mobileNumber) {
      alert("Indiquez votre numéro mobile."); return;
    }

    const commissionRate   = (isTrial || isLeasing) ? 0.03 : 0.15;
    const leasingData      = vehicle?.leasing || {};
    const leasingApport    = leasingData.apportInitial || 0;
    const leasingMensual   = leasingData.mensualite    || 0;
    const leasingDuree     = leasingData.duree         || 36;
    const leasingTotal     = leasingApport + leasingMensual * leasingDuree;
    const commissionAmount = Math.round((isLeasing ? leasingApport : baseTotal) * commissionRate);
    const partnerPayout    = Math.max((isLeasing ? leasingApport : baseTotal) - commissionAmount - SERVICE_FEE, 0);

    const finalPickup = pickupMethod === "retrait"
      ? `Retrait en agence — ${agencyFull || "adresse communiquée par le partenaire"}`
      : pickupAddress;

    const booking = isLeasing
      ? {
          id: Date.now(), userId: user?.id,
          vehicleId: vehicle._id || vehicle.id,
          vehicleName: vehicle.title || vehicle.name, vehicleMode: vehicle.mode,
          ...trialForm, type: "leasing", status: "À confirmer",
          createdAt: new Date().toISOString(),
          serviceFeeFCFA: SERVICE_FEE, commissionRate, commissionAmount, partnerPayout,
          leasingInfo: { apportInitial: leasingApport, mensualite: leasingMensual, duree: leasingDuree, totalLeasing: leasingTotal, tauxInteret: leasingData.tauxInteret || 8 },
          total: leasingApport,
          paymentInfo: paymentForm, clientVerification: verificationForm,
        }
      : isTrial
      ? {
          id: Date.now(), userId: user?.id,
          vehicleId: vehicle._id || vehicle.id,
          vehicleName: vehicle.title || vehicle.name, vehicleMode: vehicle.mode,
          ...trialForm, type: "essai", status: "À confirmer",
          createdAt: new Date().toISOString(),
          serviceFeeFCFA: SERVICE_FEE, commissionRate, commissionAmount,
          paymentInfo: paymentForm, clientVerification: verificationForm,
        }
      : {
          id: Date.now(), userId: user?.id,
          vehicleId: vehicle._id || vehicle.id,
          vehicleName: vehicle.title || vehicle.name, vehicleMode: vehicle.mode, vehicleType: vehicle.type,
          pricePerDay: vehicle.pricePerDay, ...form,
          pickupMethod,
          pickupAddress: finalPickup,
          pickupPosition: pickupMethod === "livraison" ? pickupPosition : null,
          deliveryFee,
          geoDistance,
          agencyInfo: pickupMethod === "retrait" ? { name: agencyName, phone: agencyPhone, address: agencyFull } : null,
          selectedOptions, days, optionsTotal, baseTotal,
          serviceFeeFCFA: SERVICE_FEE, total: totalToPay,
          createdAt: new Date().toISOString(),
          commissionRate, commissionAmount, partnerPayout,
          paidWith: paymentForm.paymentMethod,
          paymentInfo: paymentForm, clientVerification: verificationForm,
          type: "location", status: "À confirmer",
        };

    addBooking(booking);

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const clientInfo = {
        firstName: isTrial || isLeasing ? trialForm.firstName : form.firstName,
        lastName:  isTrial || isLeasing ? trialForm.lastName  : form.lastName,
        email:     isTrial || isLeasing ? trialForm.email     : form.email,
        phone:     isTrial || isLeasing ? trialForm.phone     : form.phone,
      };

      const apiPayload = isLeasing
        ? {
            type: "leasing", clientInfo,
            vehicleId: vehicle._id || vehicle.id,
            leasing: { apportInitial: leasingApport, mensualite: leasingMensual, duree: leasingDuree, totalLeasing: leasingTotal, tauxInteret: vehicle?.leasing?.tauxInteret || 8 },
            clientVerification: verificationForm,
          }
        : isTrial
        ? {
            type: "essai", clientInfo,
            vehicleId: vehicle._id || vehicle.id,
            essai: { preferredDate: trialForm.preferredDate, preferredTime: trialForm.preferredTime, notes: trialForm.notes || "" },
            clientVerification: verificationForm,
          }
        : {
            type: "location", clientInfo,
            vehicleId: vehicle._id || vehicle.id,
            location: {
              startDate:      form.startDate,
              endDate:        form.endDate,
              days,
              pickupMethod,
              pickupLocation: finalPickup,
              pickupPosition: pickupMethod === "livraison" ? pickupPosition : null,
              deliveryFee,
              distanceKm:     geoDistance,
              options:        selectedOptions,
            },
            clientVerification: verificationForm,
            payment: { method: paymentForm.paymentMethod, mobileNumber: paymentForm.mobileNumber || undefined, cardNumber: paymentForm.cardNumber || undefined, cardHolder: paymentForm.cardHolder || undefined },
          };

      await fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(apiPayload) });
    } catch { /* offline */ }

    navigate("/booking/success", { state: { booking, trial: isTrial || isLeasing, payment: paymentForm } });
  };

  const paymentOptions = [
    { value: "orange", label: "🟠 Orange Money" },
    { value: "wave",   label: "🔵 Wave" },
    { value: "mtn",    label: "💛 MTN Mobile Money" },
    { value: "moov",   label: "🟢 Moov Money" },
    { value: "card",   label: "💳 Carte bancaire" },
    { value: "paypal", label: "🅿️ PayPal" },
    { value: "cash",   label: "💵 Espèces à la livraison" },
  ];

  const stepLabels = ["1. Réservation", "2. Vérification", "3. Paiement"];

  if (loading) return (
    <div className={styles.page}><div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement...</p></div></div>
  );

  if (error || !vehicle) return (
    <div className={styles.page}>
      <div style={{ textAlign: "center", padding: "3rem 1.5rem", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚗</div>
        <h2 style={{ color: "#0f1b3f", margin: "0 0 10px" }}>Véhicule introuvable</h2>
        <p style={{ color: "#5a6a8a", marginBottom: 24 }}>{error || "Ce véhicule n'existe plus ou a été retiré."}</p>
        <button onClick={() => navigate("/catalogue")}
          style={{ background: "#ff4d2d", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: "0.95rem" }}>
          ← Retour au catalogue
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1>{isTrial ? "Demander un essai" : "Réservez votre véhicule"}</h1>

        {/* Steps */}
        <div className={styles.stepIndicator}>
          {stepLabels.map((label, i) => (
            <button key={i} type="button"
              className={`${styles.stepBtn} ${step === i + 1 ? styles.stepActive : ""} ${step > i + 1 ? styles.stepDone : ""}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════ ÉTAPE 1 ══════════════ */}
        {step === 1 && (
          <form onSubmit={handleStepOneSubmit} className={styles.form}>

            {/* Coordonnées */}
            <div className={styles.section}>
              <h3>{isTrial ? "Vos coordonnées" : "Informations client"}</h3>
              <div className={styles.row}>
                <input type="text"  name="firstName" placeholder="Prénom *" required
                  value={isTrial ? trialForm.firstName : form.firstName}
                  onChange={isTrial ? handleTrialChange : handleChange} />
                <input type="text"  name="lastName"  placeholder="Nom *" required
                  value={isTrial ? trialForm.lastName : form.lastName}
                  onChange={isTrial ? handleTrialChange : handleChange} />
              </div>
              <div className={styles.row}>
                <input type="email" name="email" placeholder="E-mail *" required
                  value={isTrial ? trialForm.email : form.email}
                  onChange={isTrial ? handleTrialChange : handleChange} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="+212 06 00 00 00 00 *"
                    required
                    value={isTrial ? trialForm.phone : form.phone}
                    onChange={(e) => {
                      if (isTrial) handleTrialChange(e);
                      else handleChange(e);
                      setPhoneValidation(validatePhone(e.target.value));
                    }}
                    style={{
                      borderColor: phoneValidation.ok === true  ? "#10b981"
                               : phoneValidation.ok === false ? "#ef4444"
                               : undefined,
                    }}
                  />
                  {phoneValidation.message && (
                    <span style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: phoneValidation.ok ? "#059669" : "#dc2626",
                    }}>
                      {phoneValidation.ok ? "✓" : "✗"} {phoneValidation.message}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* RDV essai */}
            {isTrial && (
              <div className={styles.section}>
                <h3>RDV d'essai</h3>
                <div className={styles.row}>
                  <label>Date <input type="date" name="preferredDate" value={trialForm.preferredDate} onChange={handleTrialChange} required /></label>
                  <label>Heure <input type="time" name="preferredTime" value={trialForm.preferredTime} onChange={handleTrialChange} required /></label>
                </div>
                <textarea name="notes" placeholder="Notes (facultatif)" value={trialForm.notes} onChange={handleTrialChange} />
              </div>
            )}

            {/* Section location */}
            {!isTrial && (
              <>
                {/* Dates */}
                <div className={styles.section}>
                  <h3>Dates de location</h3>
                  <div className={styles.row}>
                    <label>Date de début
                      <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required
                        min={new Date().toISOString().split("T")[0]} />
                    </label>
                    <label>Date de fin
                      <input type="date" name="endDate" value={form.endDate} onChange={handleChange} required
                        min={form.startDate || new Date().toISOString().split("T")[0]} />
                    </label>
                  </div>
                  {days > 0 && (
                    <p className={styles.daysLabel}>📅 {days} jour{days > 1 ? "s" : ""} de location</p>
                  )}
                </div>

                {/* ── PRISE EN CHARGE ── */}
                <div className={styles.section}>
                  <h3>Mode de prise en charge</h3>

                  <div className={styles.pickupCards}>
                    {/* Livraison */}
                    <div
                      className={`${styles.pickupCard} ${pickupMethod === "livraison" ? styles.pickupCardActive : ""}`}
                      onClick={() => setPickupMethod("livraison")}
                      role="button"
                    >
                      <span className={styles.pickupIcon}>🚚</span>
                      <div>
                        <strong>Livraison à domicile</strong>
                        <span>Le partenaire livre le véhicule à votre adresse</span>
                      </div>
                      <div className={styles.pickupRadio}>{pickupMethod === "livraison" ? "●" : "○"}</div>
                    </div>

                    {/* Retrait */}
                    <div
                      className={`${styles.pickupCard} ${pickupMethod === "retrait" ? styles.pickupCardActive : ""}`}
                      onClick={() => setPickupMethod("retrait")}
                      role="button"
                    >
                      <span className={styles.pickupIcon}>🏢</span>
                      <div>
                        <strong>Retrait en agence</strong>
                        <span>Je viens récupérer le véhicule — gratuit</span>
                      </div>
                      <div className={styles.pickupRadio}>{pickupMethod === "retrait" ? "●" : "○"}</div>
                    </div>
                  </div>

                  {/* ─── LIVRAISON à domicile ─── */}
                  {pickupMethod === "livraison" && (
                    <div className={styles.deliveryBlock}>

                      {/* Titre */}
                      <p className={styles.deliveryTitle}>
                        📍 Votre adresse de livraison
                      </p>

                      {/* Bouton GPS unique */}
                      <button
                        type="button"
                        className={`${styles.gpsMainBtn} ${gpsState === "loading" ? styles.gpsMainBtnLoading : gpsState === "ok" ? styles.gpsMainBtnOk : ""}`}
                        onClick={handleDetectGPS}
                        disabled={gpsState === "loading"}
                      >
                        {gpsState === "loading" && <span className={styles.gpsSpinnerInline} />}
                        {gpsState === "ok"      && <span>✓</span>}
                        {gpsState === "idle"    && <span>🎯</span>}
                        {gpsState === "error"   && <span>🔄</span>}
                        {gpsState === "loading" ? "Détection de votre position…"
                          : gpsState === "ok"  ? "Position détectée — Cliquez pour actualiser"
                          : gpsState === "error" ? "Réessayer la détection GPS"
                          : "Détecter ma position par GPS"}
                      </button>

                      {/* Erreur GPS → explication */}
                      {gpsState === "error" && (
                        <div className={styles.gpsErrorBox}>
                          <span>⚠️</span>
                          <div>
                            <strong>GPS indisponible</strong>
                            <p>{gpsError}</p>
                            <p>Saisissez votre adresse manuellement ci-dessous.</p>
                          </div>
                        </div>
                      )}

                      {/* Champ adresse (toujours visible) */}
                      <div className={styles.addressInputWrap}>
                        <input
                          type="text"
                          className={styles.addressMainInput}
                          placeholder="Ex: 15 Rue Hassan II, Casablanca, Maroc"
                          value={pickupAddress}
                          onChange={(e) => {
                            setPickupAddress(e.target.value);
                            if (!e.target.value) { setPickupPosition(null); setGeoDistance(null); setGeoFee(null); }
                          }}
                          required={pickupMethod === "livraison"}
                        />
                        {pickupAddress && (
                          <button
                            type="button"
                            className={styles.addressClearBtn}
                            onClick={() => { setPickupAddress(""); setPickupPosition(null); setGeoDistance(null); setGeoFee(null); setGpsState("idle"); }}
                          >✕</button>
                        )}
                      </div>

                      {/* Résultat position GPS */}
                      {gpsState === "ok" && pickupPosition && (
                        <div className={styles.gpsPositionCard}>
                          <div className={styles.gpsPositionHeader}>
                            <span className={styles.gpsPositionDot} />
                            <strong>Position GPS confirmée</strong>
                          </div>
                          <p className={styles.gpsCoords}>
                            {pickupPosition.lat.toFixed(6)}, {pickupPosition.lng.toFixed(6)}
                          </p>
                          <a
                            href={`https://www.google.com/maps?q=${pickupPosition.lat},${pickupPosition.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.gpsMapLink}
                          >
                            🗺️ Vérifier sur Google Maps
                          </a>
                        </div>
                      )}

                      {/* Frais de livraison calculés */}
                      {pickupMethod === "livraison" && (
                        <div className={styles.geoDeliveryBox}>
                          <div className={styles.geoDeliveryHeader}>
                            <span className={styles.geoDeliveryIcon}>🚚</span>
                            <div>
                              <strong>Frais de livraison GPS</strong>
                              <p>Calculés selon la distance réelle partenaire ↔ vous</p>
                            </div>
                          </div>

                          {!pickupPosition ? (
                            <div className={styles.geoDeliveryAlert}>
                              Activez votre GPS ou saisissez votre adresse pour calculer les frais.
                            </div>
                          ) : geoFeeLoading ? (
                            <div className={styles.geoDeliveryLoading}>
                              <span className={styles.geoSpinner} />
                              Calcul de la distance en cours…
                            </div>
                          ) : (
                            <div className={styles.geoDeliveryResult}>
                              {agencyFull && (
                                <div className={styles.geoResultRow}>
                                  <span>🏢 Partenaire</span>
                                  <strong>{agencyFull.length > 40 ? agencyFull.slice(0, 40) + "…" : agencyFull}</strong>
                                </div>
                              )}
                              <div className={styles.geoResultRow}>
                                <span>📍 Vous</span>
                                <strong>{pickupAddress?.split(",")[0] || "Détectée"}</strong>
                              </div>
                              {geoDistance != null && (
                                <div className={styles.geoResultRow}>
                                  <span>📏 Distance</span>
                                  <strong>{geoDistance} km</strong>
                                </div>
                              )}
                              <div className={styles.geoResultFee}>
                                <span>🚚 Frais de livraison</span>
                                <strong className={styles.geoFeeAmount}>{fmt(deliveryFee)}</strong>
                              </div>
                              <p className={styles.geoFeeNote}>
                                Tarif : {fmt(DELIVERY_BASE)} base + {DELIVERY_PER_KM} FCFA/km
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── RETRAIT en agence ─── */}
                  {pickupMethod === "retrait" && (
                    <div className={styles.agencyCard}>
                      <div className={styles.agencyHeader}>
                        <div className={styles.agencyAvatar}>
                          {agencyName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong className={styles.agencyName}>{agencyName}</strong>
                          <span className={styles.agencyLabel}>Point de retrait</span>
                        </div>
                        <div className={styles.agencyFreeTag}>Gratuit</div>
                      </div>

                      <div className={styles.agencyDetails}>
                        {agencyFull ? (
                          <div className={styles.agencyRow}>
                            <span>📍</span>
                            <span>{agencyFull}</span>
                          </div>
                        ) : (
                          <div className={styles.agencyRow}>
                            <span>📍</span>
                            <span style={{ color: "#8493b0", fontStyle: "italic" }}>
                              Adresse communiquée après confirmation
                            </span>
                          </div>
                        )}

                        {agencyPhone && (
                          <div className={styles.agencyRow}>
                            <span>📞</span>
                            <a href={`tel:${agencyPhone}`} className={styles.agencyPhone}>
                              {agencyPhone}
                            </a>
                          </div>
                        )}

                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className={styles.agencyMapBtn}>
                            🗺️ Ouvrir dans Google Maps
                          </a>
                        )}
                      </div>

                      <div className={styles.agencyNotice}>
                        <span>ℹ️</span>
                        <p>
                          Présentez-vous avec votre pièce d'identité et la confirmation de réservation.
                          Le partenaire vous contactera pour confirmer l'heure de disponibilité.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Options supplémentaires */}
                <div className={styles.section}>
                  <h3>Options supplémentaires</h3>

                  {gpsAutoIncluded && (
                    <div className={styles.gpsIncluded}>
                      <span>📍</span>
                      <strong>GPS de livraison inclus</strong>
                      <span>— associé automatiquement à votre adresse</span>
                    </div>
                  )}

                  <div className={styles.optionsGrid}>
                    {!gpsAutoIncluded && (
                      <label className={styles.optionItem}>
                        <input type="checkbox" name="gps" checked={selectedOptions.gps} onChange={handleChange} />
                        <span>{gpsOption.label} +{gpsOption.price.toLocaleString("fr-FR")} FCFA/jour</span>
                      </label>
                    )}
                    {optionsData.map((option) => (
                      <label key={option.id} className={styles.optionItem}>
                        <input type="checkbox" name={option.id} checked={selectedOptions[option.id]} onChange={handleChange} />
                        <span>{option.label} +{option.price.toLocaleString("fr-FR")} FCFA/jour</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className={styles.section}>
              <button type="submit" className={styles.primaryBtn}>Continuer →</button>
            </div>
          </form>
        )}

        {/* ══════════════ ÉTAPE 2 — VÉRIFICATION ══════════════ */}
        {step === 2 && (
          <form onSubmit={handleVerifSubmit} className={styles.form}>

            {/* En-tête sécurité */}
            <div className={styles.verifHero}>
              <div className={styles.verifHeroIcon}>🛡️</div>
              <div>
                <h3 className={styles.verifHeroTitle}>Vérification d'identité</h3>
                <p className={styles.verifHeroSub}>
                  Votre pièce d'identité doit être valide et authentique.
                  Données chiffrées TLS 1.3 — jamais revendues.
                </p>
              </div>
            </div>

            {/* Type de pièce */}
            <div className={styles.section}>
              <h4 className={styles.fieldLabel}>Type de document *</h4>
              <div className={styles.idTypeGrid}>
                {[
                  { value: "cni",      icon: "🪪", label: "Carte nationale (CNI)" },
                  { value: "passport", icon: "📘", label: "Passeport" },
                  { value: "permis",   icon: "🚗", label: "Permis de conduire" },
                ].map((doc) => (
                  <button
                    key={doc.value}
                    type="button"
                    className={`${styles.idTypeBtn} ${verificationForm.idType === doc.value ? styles.idTypeBtnActive : ""}`}
                    onClick={() => handleVerifChange({ target: { name: "idType", value: doc.value, type: "select" } })}
                  >
                    <span className={styles.idTypeIcon}>{doc.icon}</span>
                    <span>{doc.label}</span>
                  </button>
                ))}
              </div>

              {/* Numéro + validation */}
              <div className={styles.idNumberSection}>
                <h4 className={styles.fieldLabel}>
                  Numéro de {ID_RULES[verificationForm.idType]?.label || "document"} *
                </h4>
                <p className={styles.idHint}>
                  💡 {ID_RULES[verificationForm.idType]?.hint}
                </p>

                <div className={styles.idNumberWrap}>
                  <input
                    type="text"
                    name="idNumber"
                    placeholder={`Ex: ${ID_RULES[verificationForm.idType]?.patterns[0]?.example || "Numéro du document"}`}
                    value={verificationForm.idNumber}
                    onChange={handleVerifChange}
                    className={`${styles.idNumberInput}
                      ${idValidation.status === "valid"   ? styles.idInputValid   : ""}
                      ${idValidation.status === "warning" ? styles.idInputWarning : ""}
                      ${idValidation.status === "error"   ? styles.idInputError   : ""}
                      ${verifyDone                         ? styles.idInputVerified : ""}
                    `}
                    required
                    autoComplete="off"
                    maxLength={25}
                    disabled={verifying}
                  />
                  {/* Icône statut */}
                  <span className={styles.idStatusIcon}>
                    {verifying      && <span className={styles.idSpinner} />}
                    {verifyDone     && !verifying && "✓"}
                    {verifyFailed   && !verifying && "✗"}
                    {!verifying && !verifyDone && !verifyFailed && idValidation.status === "valid"   && "✓"}
                    {!verifying && !verifyDone && !verifyFailed && idValidation.status === "warning" && "⚠"}
                    {!verifying && !verifyDone && !verifyFailed && idValidation.status === "error"   && "✗"}
                  </span>
                </div>

                {/* Message de validation temps réel */}
                {idValidation.message && !verifyDone && !verifyFailed && (
                  <div className={`${styles.idFeedback}
                    ${idValidation.status === "valid"   ? styles.idFeedbackValid   : ""}
                    ${idValidation.status === "warning" ? styles.idFeedbackWarning : ""}
                    ${idValidation.status === "error"   ? styles.idFeedbackError   : ""}
                  `}>
                    {idValidation.status === "valid"   ? "✓" : idValidation.status === "warning" ? "⚠" : "✗"}
                    {" "}{idValidation.message}
                  </div>
                )}

                {/* Résultat vérification */}
                {verifyDone && (
                  <div className={styles.idVerified}>
                    <span>✅</span>
                    <div>
                      <strong>Pièce d'identité vérifiée</strong>
                      <p>Le numéro a été validé avec succès. Vous pouvez continuer.</p>
                    </div>
                  </div>
                )}
                {verifyFailed && (
                  <div className={styles.idVerifyFailed}>
                    <span>❌</span>
                    <div>
                      <strong>Vérification échouée</strong>
                      <p>Le numéro saisi ne correspond pas à un document valide. Vérifiez et réessayez.</p>
                    </div>
                  </div>
                )}

                {/* Bouton Vérifier */}
                {!verifyDone && (
                  <button
                    type="button"
                    className={`${styles.verifyBtn} ${verifying ? styles.verifyBtnLoading : ""}`}
                    onClick={handleVerifyId}
                    disabled={verifying || idValidation.status === "empty" || idValidation.status === "error"}
                  >
                    {verifying ? (
                      <><span className={styles.idSpinner} /> Vérification en cours…</>
                    ) : (
                      <><span>🔍</span> Vérifier ma pièce d'identité</>
                    )}
                  </button>
                )}
              </div>

              {/* Adresse de résidence */}
              <label className={styles.fieldLabelFull} style={{ marginTop: 16 }}>
                <span className={styles.fieldLabel}>Adresse de résidence <small style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</small></span>
                <input
                  type="text"
                  name="address"
                  placeholder="Ex: Hay Riad, Rabat, Maroc"
                  value={verificationForm.address}
                  onChange={handleVerifChange}
                  className={styles.textInput}
                />
              </label>
            </div>

            {/* Sécurité info */}
            <div className={styles.securityBadges}>
              <div className={styles.securityBadge}><span>🔐</span> TLS 1.3</div>
              <div className={styles.securityBadge}><span>🇲🇦</span> Loi 09-08</div>
              <div className={styles.securityBadge}><span>🇪🇺</span> RGPD</div>
              <div className={styles.securityBadge}><span>🚫</span> Non revendues</div>
            </div>

            {/* CGU */}
            <div className={styles.section}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  name="agreeTerms"
                  checked={verificationForm.agreeTerms}
                  onChange={handleVerifChange}
                />
                J'accepte les{" "}
                <Link to="/cgu" target="_blank" rel="noopener noreferrer">conditions générales d'utilisation</Link>
                {" "}et la{" "}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">politique de confidentialité</Link>
                {" "}de VIT AUTO.
              </label>
            </div>

            <div className={styles.section} style={{ display: "flex", gap: "1rem" }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setStep(1)}>← Retour</button>
              <button
                type="submit"
                className={`${styles.primaryBtn} ${!verifyDone ? styles.primaryBtnDisabled : ""}`}
                disabled={!verifyDone}
                title={!verifyDone ? "Vérifiez d'abord votre pièce d'identité" : ""}
              >
                {verifyDone ? "Continuer →" : "🔒 Vérification requise"}
              </button>
            </div>
          </form>
        )}

        {/* ══════════════ ÉTAPE 3 ══════════════ */}
        {step === 3 && (
          <form onSubmit={handlePaymentSubmit} className={styles.form}>
            <div className={styles.section}>
              <h3>Méthode de paiement</h3>
              <div className={styles.optionsGrid}>
                {paymentOptions.map((option) => (
                  <label key={option.value} className={`${styles.optionItem} ${paymentForm.paymentMethod === option.value ? styles.optionActive : ""}`}>
                    <input type="radio" name="paymentMethod" value={option.value}
                      checked={paymentForm.paymentMethod === option.value} onChange={handleChange} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {paymentForm.paymentMethod === "card" && (
              <div className={styles.section}>
                <h3>Informations de carte</h3>
                <div className={styles.row}>
                  <input type="text" name="cardNumber"  value={paymentForm.cardNumber}  onChange={handleChange} placeholder="Numéro de carte" required />
                  <input type="text" name="cardHolder"  value={paymentForm.cardHolder}  onChange={handleChange} placeholder="Nom sur la carte" required />
                </div>
                <div className={styles.row}>
                  <input type="text" name="expiryDate" value={paymentForm.expiryDate} onChange={handleChange} placeholder="MM/AA" required />
                  <input type="text" name="cvv"        value={paymentForm.cvv}        onChange={handleChange} placeholder="CVV" required />
                </div>
              </div>
            )}

            {["orange", "wave", "mtn", "moov"].includes(paymentForm.paymentMethod) && (
              <div className={styles.section}>
                <h3>Numéro {paymentForm.paymentMethod.charAt(0).toUpperCase() + paymentForm.paymentMethod.slice(1)}</h3>
                <input type="tel" name="mobileNumber" value={paymentForm.mobileNumber} onChange={handleChange}
                  placeholder="+212 06 00 00 00 00" required />
              </div>
            )}

            <div className={styles.section} style={{ display: "flex", gap: "1rem" }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setStep(2)}>← Retour</button>
              <button type="submit" className={styles.primaryBtn}>
                Confirmer et payer {fmt(isTrial ? SERVICE_FEE : totalToPay)}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Récapitulatif sidebar ── */}
      <aside className={styles.summaryCard}>
        <h3>Récapitulatif</h3>
        <div className={styles.summaryImage}>
          <img src={vehicle.images?.[0] || vehicle.image} alt={vehicle.title || vehicle.name}
            onError={(e) => { e.target.style.display = "none"; }} />
          <span>{vehicle.title || vehicle.name}</span>
        </div>

        {isTrial ? (
          <>
            <div className={styles.summaryItem}><span>Date essai</span><strong>{trialForm.preferredDate || "—"}</strong></div>
            <div className={styles.summaryItem}><span>Heure</span><strong>{trialForm.preferredTime || "—"}</strong></div>
            <div className={styles.summaryItem}><span>Frais de service</span><strong>{fmt(SERVICE_FEE)}</strong></div>
            <div className={styles.summaryTotal}><span>À payer</span><strong>{fmt(SERVICE_FEE)}</strong></div>
          </>
        ) : (
          <>
            <div className={styles.summaryItem}><span>Prix / jour</span><strong>{fmt(vehicle.pricePerDay || 0)}</strong></div>
            {days > 0 && <div className={styles.summaryItem}><span>Durée</span><strong>{days} jour{days > 1 ? "s" : ""}</strong></div>}
            <div className={styles.summaryItem}><span>Base</span><strong>{fmt(baseTotal)}</strong></div>
            {optionsTotal > 0 && <div className={styles.summaryItem}><span>Options</span><strong>{fmt(optionsTotal)}</strong></div>}
            {pickupMethod === "livraison" && (
              <div className={styles.summaryItem}>
                <span>🚚 Livraison{geoDistance ? ` (${geoDistance} km)` : ""}</span>
                <strong>{geoFeeLoading ? "Calcul…" : fmt(deliveryFee)}</strong>
              </div>
            )}
            {pickupMethod === "retrait" && (
              <div className={styles.summaryItem}>
                <span>🏢 Retrait agence</span>
                <strong style={{ color: "#10b981" }}>Gratuit</strong>
              </div>
            )}
            <div className={styles.summaryItem}><span>Frais de service</span><strong>{fmt(SERVICE_FEE)}</strong></div>
            <div className={styles.summaryTotal}><span>Total</span><strong>{fmt(totalToPay)}</strong></div>
          </>
        )}

        {/* Mode prise en charge */}
        {!isTrial && (
          <div className={styles.pickupSummary}>
            {pickupMethod === "livraison"
              ? <><span>🚚</span>{pickupAddress ? <span>{pickupAddress.slice(0, 50)}{pickupAddress.length > 50 ? "…" : ""}</span> : <small>Adresse à renseigner</small>}</>
              : <><span>🏢</span><span>{agencyFull || "Retrait en agence"}</span></>
            }
          </div>
        )}

        <div className={styles.guarantee}>
          🛡️ Contrat digital · Paiement sécurisé · Identité vérifiée
        </div>
      </aside>
    </div>
  );
}
