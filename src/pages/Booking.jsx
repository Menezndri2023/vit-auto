import { useParams, useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth }     from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useToast }    from "../context/ToastContext";
import { haversineKm, geocodeAddress, getCurrentPosition } from "../utils/geo";
import { getKycBadge, generateBookingRef } from "../utils/kycEngine.js";
import styles from "./Booking.module.css";

/* ── Constantes financières (USD — voir PricingConfig.serviceFee/rentalOptions
   côté serveur ; ceci n'est qu'un aperçu client avant soumission, le serveur
   recalcule et fait toujours foi à la création — voir bookingController.js) ── */
const SERVICE_FEE     = 1;      // plancher serviceFee.minUSD (PricingConfig)
const DELIVERY_BASE   = 3;      // repli si /api/geo/delivery-fee échoue
const DELIVERY_PER_KM = 0.5;    // repli si /api/geo/delivery-fee échoue

const OPTIONS_CATALOG = [
  { id: "babySeat",  label: "Siège bébé",        price: 11.67, icon: "👶" },
  { id: "insurance", label: "Prime d'assurance", price: 25,    icon: "🛡️" },
  { id: "driver",    label: "Chauffeur privé",   price: 83.33, icon: "🧑‍✈️" },
  { id: "gps",       label: "GPS intégré",        price: 16.67, icon: "🗺️" },
];

// Moyens de paiement disponibles au choix du client (voir Checkout.jsx/DriverBooking.jsx).
const PAYMENT_METHODS = [
  { value: "orange_money", label: "Orange Money",    icon: "🟠", mobile: true },
  { value: "wave",         label: "Wave",             icon: "🔵", mobile: true },
  { value: "mtn",          label: "MTN Mobile Money", icon: "💛", mobile: true },
  { value: "moov",         label: "Moov Money",       icon: "🟢", mobile: true },
  { value: "card",         label: "Carte bancaire",   icon: "💳", mobile: false },
  { value: "cash",         label: "Espèces sur place", icon: "💵", mobile: false },
];

const STEPS = [
  { id: 1, label: "Dates & Prise en charge" },
  { id: 2, label: "Options" },
  { id: 3, label: "Paiement" },
  { id: 4, label: "Confirmation" },
];

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { "Accept-Language": "fr" } });
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/* ════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ════════════════════════════════════════════════════════════════ */
export default function Booking() {
  const { id }          = useParams();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const location        = useLocation();
  const { fmt, getPaymentMethodsForCountry, catalogCountry, countryCode } = useCurrency();
  const { vehicles, addBooking, getItemById } = useVehicles();
  const { token, user } = useAuth();
  const { error: toastError } = useToast();

  const getVehicleById = getItemById
    || ((vid) => vehicles?.find((v) => String(v.id) === String(vid) || v._id === String(vid)));
  const vehicle = getVehicleById(id);

  // "leasing" (LOA) et "credit" (crédit classique) partagent exactement le
  // même parcours de réservation — seule la source des conditions financières
  // change (Vehicle.leasing vs Vehicle.credit), voir Booking.leasing.financingType
  // côté serveur.
  const financingType    = searchParams.get("type") === "credit" ? "credit" : "leasing";
  const isLeasingRequest = ["leasing", "credit"].includes(searchParams.get("type"));
  const isSaleMode       = vehicle?.mode === "Acheter";
  const isTrial          = isSaleMode && !isLeasingRequest;
  const financingTerms   = financingType === "credit" ? vehicle?.credit : vehicle?.leasing;
  const isLeasing        = isSaleMode && isLeasingRequest && financingTerms?.disponible;

  /* ── KYC Gate ─────────────────────────────────────────────────── */
  const [liveKycScore,   setLiveKycScore]   = useState(null);
  const [liveKycStatus,  setLiveKycStatus]  = useState(null);
  const [liveDriverLic,  setLiveDriverLic]  = useState(null); // permis OCR du user
  const kycScore  = liveKycScore  ?? user?.kycScore  ?? 0;
  const kycStatus = liveKycStatus ?? user?.kycStatus ?? "EN_ATTENTE";
  const kycBadge  = getKycBadge(kycScore);
  const kycOk     = kycStatus === "VERIFIE" || kycBadge.canBook;

  // Le véhicule exige-t-il un permis ? (vehicle.permisRequis = true par défaut)
  const vehicleRequiresLicense = vehicle?.permisRequis !== false;
  // Le client a-t-il un permis vérifié ? (driverLicenseOcr soumis)
  const hasVerifiedLicense = !!(liveDriverLic?.licenseNumber || liveDriverLic?.rawOcrText);
  // Blocage permis uniquement si : location + véhicule l'exige + pas de permis vérifié
  const licenseRequired = vehicleRequiresLicense && isSaleMode === false;
  // (On ne bloque pas avant la réservation — le partenaire peut vérifier en présentiel)

  // Rafraîchissement du statut KYC à chaque navigation vers cette page (retour de /kyc inclus)
  const { updateUser } = useAuth();
  useEffect(() => {
    if (!token) return;
    fetch("/api/kyc/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setLiveKycScore(d.kycScore ?? 0);
        setLiveKycStatus(d.kycStatus ?? "EN_ATTENTE");
        if (d.driverLicenseOcr) setLiveDriverLic(d.driverLicenseOcr);
        updateUser({ kycScore: d.kycScore ?? 0, kycBadge: d.kycBadge ?? "INSUFFISANT", kycStatus: d.kycStatus ?? "EN_ATTENTE" });
      })
      .catch(() => {});
  // location.key change à chaque navigation (retour de /kyc → nouveau key)
  }, [token, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Étapes ────────────────────────────────────────────────────── */
  const [step, setStep] = useState(1);

  /* ── Dates bloquées ────────────────────────────────────────────── */
  const [blockedDays, setBlockedDays] = useState([]);
  const blockedSet = useMemo(() => new Set(blockedDays), [blockedDays]);

  useEffect(() => {
    const vid = vehicle?._id || vehicle?.id;
    if (!vid || vehicle?.mode === "Acheter") return;
    fetch(`/api/bookings/vehicle/${vid}/occupied-dates`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.blockedDays) setBlockedDays(d.blockedDays); })
      .catch(() => {});
  }, [vehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Créneaux d'essai déjà pris (véhicule en vente) ───────────────── */
  const [essaiOccupiedSlots, setEssaiOccupiedSlots] = useState([]);

  useEffect(() => {
    const vid = vehicle?._id || vehicle?.id;
    if (!vid || vehicle?.mode !== "Acheter") return;
    fetch(`/api/bookings/vehicle/${vid}/essai-slots`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.occupied) setEssaiOccupiedSlots(d.occupied); })
      .catch(() => {});
  }, [vehicle]);

  /* ── STEP 1 : Dates + Prise en charge ─────────────────────────── */
  const [form, setForm] = useState({
    firstName:     user?.firstName || "",
    lastName:      user?.lastName  || "",
    email:         user?.email     || "",
    phone:         user?.phone     || "",
    startDate:     "",
    endDate:       "",
    preferredDate: "",
    preferredTime: "",
    notes:         "",
  });

  const [pickupMethod,   setPickupMethod]   = useState("retrait");
  const [pickupAddress,  setPickupAddress]  = useState("");
  const [pickupPosition, setPickupPosition] = useState(null);
  const [gpsState,       setGpsState]       = useState("idle");
  const [gpsError,       setGpsError]       = useState("");
  const [geoDistance,    setGeoDistance]    = useState(null);
  const [geoFee,         setGeoFee]         = useState(null);
  const [geoFeeLoading,  setGeoFeeLoading]  = useState(false);
  const [leasingAccepted, setLeasingAccepted] = useState(false);

  /* ── STEP 2 : Options ──────────────────────────────────────────── */
  const [selectedOptions, setSelectedOptions] = useState({ babySeat: false, insurance: false, driver: false, gps: false });

  /* ── STEP 3 : Paiement ─────────────────────────────────────────── */
  const [payMethod,      setPayMethod]      = useState("orange_money");
  const [mobileNumber,   setMobileNumber]   = useState(user?.phone || "");
  const [cardNumber,     setCardNumber]     = useState("");
  const [cardHolder,     setCardHolder]     = useState("");
  const [cardExpiry,     setCardExpiry]     = useState("");
  const [cardCvv,        setCardCvv]        = useState("");

  /* ── Infos partenaire ──────────────────────────────────────────── */
  const agencyName    = vehicle?.contactNom  || vehicle?.ownerName  || "Partenaire VIT AUTO";
  const agencyPhone   = vehicle?.contactTel  || vehicle?.ownerPhone || null;
  const agencyCity    = vehicle?.ville       || vehicle?.ownerCity  || "";
  const agencyAddress = vehicle?.adresse     || "";
  const agencyFull    = [agencyAddress, agencyCity].filter(Boolean).join(", ");

  /* ── Calculs financiers ────────────────────────────────────────── */
  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s) || isNaN(e)) return 0;
    const d = Math.ceil((e - s) / 86400000);
    return d > 0 ? d : 0;
  }, [form.startDate, form.endDate]);

  const optionsTotal = useMemo(() => {
    return OPTIONS_CATALOG.reduce((acc, opt) => {
      if (!selectedOptions[opt.id]) return acc;
      return acc + opt.price * Math.max(days, 1);
    }, 0);
  }, [selectedOptions, days]);

  /* ── Créneau d'essai souhaité + détection de conflit (même durée fixe 1h
     que server/controllers/bookingController.js ESSAI_DURATION_MS — le
     serveur reste seul autoritaire, cette vérification n'est qu'un avertissement
     immédiat côté client) ─────────────────────────────────────────────── */
  const essaiStart = useMemo(() => {
    if (!form.preferredDate || !form.preferredTime) return null;
    const d = new Date(`${form.preferredDate}T${form.preferredTime}:00`);
    return isNaN(d.getTime()) ? null : d;
  }, [form.preferredDate, form.preferredTime]);

  const essaiEnd = useMemo(() => essaiStart ? new Date(essaiStart.getTime() + 60 * 60 * 1000) : null, [essaiStart]);

  const essaiConflict = useMemo(() => {
    if (!essaiStart || !essaiEnd) return null;
    return essaiOccupiedSlots.find((slot) => {
      const s = new Date(slot.date), e = new Date(slot.dateFin);
      return essaiStart < e && essaiEnd > s;
    }) || null;
  }, [essaiStart, essaiEnd, essaiOccupiedSlots]);

  const deliveryFee  = (pickupMethod === "livraison" && !isLeasing) ? (geoFee ?? 3000) : 0;
  // Leasing = achat à mensualités : le seul montant exigé à la réservation est
  // l'apport initial fixé par le partenaire (financingTerms), jamais un prix/jour
  // (qui n'existe pas pour un véhicule en mode "Acheter") — voir bookingController.js
  // createBooking, qui calcule montantBase de la même façon côté serveur.
  // Promotion active du véhicule (affichage uniquement — même logique que
  // VehicleCard.jsx/server/utils/promotion.js ; le prix réellement facturé
  // reste toujours recalculé et autoritaire côté serveur dans createBooking).
  const promo = vehicle?.promotion;
  const promoActive = !!(
    promo?.active && promo.discountPercent > 0 &&
    (!promo.startDate || new Date(promo.startDate) <= new Date()) &&
    (!promo.endDate   || new Date(promo.endDate)   >= new Date())
  );
  const effectivePricePerDay = promoActive
    ? Math.round((vehicle?.pricePerDay || 0) * (1 - promo.discountPercent / 100))
    : (vehicle?.pricePerDay || 0);
  const baseTotal    = isLeasing
    ? (financingTerms?.apportInitial || 0)
    : effectivePricePerDay * Math.max(days, 1);
  const totalToPay   = isTrial ? SERVICE_FEE
    : isLeasing ? baseTotal + SERVICE_FEE
    : baseTotal + optionsTotal + deliveryFee + SERVICE_FEE;

  /* ── GPS ───────────────────────────────────────────────────────── */
  const handleDetectGPS = async () => {
    setGpsState("loading");
    setGpsError("");
    setPickupAddress("");
    setPickupPosition(null);
    setGeoDistance(null);
    setGeoFee(null);

    try {
      const pos = await new Promise((res, rej) =>
        getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => rej(new Error(e.code === 1 ? "Accès GPS refusé." : "Position indisponible.")),
          { enableHighAccuracy: true, timeout: 12000 }
        )
      );
      const addr = await reverseGeocode(pos.lat, pos.lng);
      setPickupPosition(pos);
      setPickupAddress(addr);
      setGpsState("ok");
    } catch (err) {
      setGpsState("error");
      setGpsError(err.message);
    }
  };

  // Calcul frais livraison GPS
  useEffect(() => {
    if (!pickupPosition || pickupMethod !== "livraison") { setGeoDistance(null); setGeoFee(null); return; }
    const compute = async () => {
      setGeoFeeLoading(true);
      try {
        const res = await fetch(`/api/geo/delivery-fee?clientLat=${pickupPosition.lat}&clientLng=${pickupPosition.lng}&vehicleId=${vehicle?._id || vehicle?.id || ""}`);
        if (res.ok) {
          const data = await res.json();
          if (data.fee != null) { setGeoDistance(data.distanceKm); setGeoFee(data.fee); setGeoFeeLoading(false); return; }
        }
      } catch {}
      // Fallback Haversine
      if (agencyFull) {
        const pPos = await geocodeAddress(agencyFull);
        if (pPos) {
          const km  = haversineKm(pickupPosition.lat, pickupPosition.lng, pPos.lat, pPos.lng);
          const fee = Math.round(DELIVERY_BASE + DELIVERY_PER_KM * km);
          setGeoDistance(parseFloat(km.toFixed(1)));
          setGeoFee(fee);
        }
      }
      setGeoFeeLoading(false);
    };
    compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPosition, pickupMethod]);

  /* ── Soumission finale ─────────────────────────────────────────── */
  const bookingRef = useMemo(() => generateBookingRef(isTrial ? "essai" : isLeasing ? "leasing" : "location"), []);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);

    const finalPickup = pickupMethod === "retrait"
      ? `Retrait agence — ${agencyFull || "adresse communiquée"}`
      : pickupAddress;

    const commissionRate   = (isTrial || isLeasing) ? 0.03 : 0.15;
    const commissionAmount = Math.round(baseTotal * commissionRate);
    const partnerPayout    = Math.max(baseTotal - commissionAmount - SERVICE_FEE, 0);

    const bookingData = {
      id:           Date.now(),
      reference:    bookingRef,
      userId:       user?.id || user?._id,
      vehicleId:    vehicle?._id || vehicle?.id,
      vehicleName:  vehicle?.title || vehicle?.name,
      vehicleMode:  vehicle?.mode,
      vehicleType:  vehicle?.type || vehicle?.vehicleType || "Voiture",
      pricePerDay:  vehicle?.pricePerDay,
      type:         isTrial ? "essai" : isLeasing ? "leasing" : "location",
      status:       "pending",
      createdAt:    new Date().toISOString(),
      // Champs top-level pour BookingSuccess + normalizeBackendBooking
      firstName:    form.firstName,
      lastName:     form.lastName,
      email:        form.email,
      phone:        form.phone,
      clientInfo: {
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        phone:     form.phone,
      },
      kycVerified:    kycOk,
      kycScore:       kycScore,
      kycBadge:       kycBadge.badge,
      // Location specifics
      ...(!isTrial && !isLeasing ? {
        startDate:      form.startDate,
        endDate:        form.endDate,
        days,
        pickupMethod,
        pickupLocation: finalPickup,
        pickupAddress:  finalPickup,
        pickupPosition: pickupMethod === "livraison" ? pickupPosition : null,
        deliveryFee,
        geoDistance,
        selectedOptions,           // clé utilisée par BookingSuccess
        options:        selectedOptions, // clé utilisée par VehicleContext
        optionsTotal,
        baseTotal,
        montantTotal:   totalToPay,
        total:          totalToPay,
        serviceFeeFCFA: SERVICE_FEE,
        commissionRate,
        commissionAmount,
        partnerPayout,
        // Estimation d'affichage uniquement — la valeur autoritaire est celle
        // renseignée par le partenaire (vehicle.caution), jamais un pourcentage
        // du total. Écrasée par la vraie valeur serveur juste après la création
        // (voir plus bas, apiData.booking.cautionAmount).
        cautionAmount:  vehicle?.caution || 0,
        paidWith:       payMethod,
        mobileNumber:   ["orange_money","wave","mtn","moov"].includes(payMethod) ? mobileNumber : undefined,
      } : {}),
      // Essai specifics
      ...(isTrial ? {
        preferredDate:  form.preferredDate,
        preferredTime:  form.preferredTime,
        notes:          form.notes || "",
        serviceFeeFCFA: SERVICE_FEE,
        montantTotal:   SERVICE_FEE,
        total:          SERVICE_FEE,
      } : {}),
      // Leasing/Crédit specifics
      ...(isLeasing ? {
        leasing: {
          financingType,
          apportInitial: financingTerms?.apportInitial || 0,
          mensualite:    financingTerms?.mensualite    || 0,
          duree:         financingTerms?.duree         || 36,
          tauxInteret:   financingTerms?.tauxInteret   || 8,
          totalLeasing:  (financingTerms?.apportInitial || 0) + (financingTerms?.mensualite || 0) * (financingTerms?.duree || 36),
        },
        serviceFeeFCFA: SERVICE_FEE,
        montantTotal:   totalToPay,
        total:          totalToPay,
      } : {}),
    };

    addBooking(bookingData);

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const payload = {
        type:       bookingData.type,
        reference:  bookingRef,
        vehicleId:  vehicle?._id || vehicle?.id,
        clientInfo: {
          ...bookingData.clientInfo,
          kycStatus: kycStatus,
          kycScore:  kycScore,
          kycBadge:  kycBadge.badge,
          kycVerified: kycOk,
        },
        ...((!isTrial && !isLeasing) ? {
          location: {
            startDate:      form.startDate,
            endDate:        form.endDate,
            days,
            pickupMethod,
            pickupLocation: finalPickup,
            pickupPosition: pickupMethod === "livraison" ? pickupPosition : null,
            options:        selectedOptions,
          },
          payment: {
            method:       payMethod,
            mobileNumber: mobileNumber || undefined,
            // Seuls les 4 derniers chiffres quittent le navigateur — le numéro complet
            // n'a besoin d'exister que côté client (aucune passerelle réelle ne le
            // consomme ici) ; le transmettre au serveur mettrait inutilement la
            // plateforme dans le périmètre PCI-DSS.
            cardLast4:    cardNumber ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
            cardHolder:   cardHolder || undefined,
          },
        } : {}),
        ...(isTrial ? {
          essai: {
            preferredDate: form.preferredDate,
            preferredTime: form.preferredTime,
            notes:         form.notes || "",
          },
        } : {}),
        // Leasing : apport initial (seul montant exigé à la réservation, voir
        // bookingController.createBooking) + moyen de paiement de cet apport —
        // sans ce bloc, ni le montant ni le mode de paiement n'atteignaient
        // jamais le serveur et la réservation était enregistrée à 0 FCFA.
        ...(isLeasing ? {
          leasing: {
            financingType,
            apportInitial: financingTerms?.apportInitial || 0,
            mensualite:    financingTerms?.mensualite    || 0,
            duree:         financingTerms?.duree         || 36,
            tauxInteret:   financingTerms?.tauxInteret   || 8,
            totalLeasing:  (financingTerms?.apportInitial || 0) + (financingTerms?.mensualite || 0) * (financingTerms?.duree || 36),
          },
          payment: {
            method:       payMethod,
            mobileNumber: mobileNumber || undefined,
            cardLast4:    cardNumber ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
            cardHolder:   cardHolder || undefined,
          },
        } : {}),
      };

      const apiRes = await fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(payload) });
      const apiData = await apiRes.json().catch(() => ({}));
      // Si la réponse contient un bookingId serveur, le mémoriser
      if (apiRes.ok && apiData.booking?._id) {
        bookingData.serverBookingId = apiData.booking._id;
        bookingData.reference       = apiData.booking.reference || bookingRef;
        bookingData.status          = apiData.booking.status    || "pending";
        // Le serveur reste seul autoritaire pour tout montant recalculé
        // (promotion, frais de livraison, caution) — on écrase les estimations
        // client par les vraies valeurs renvoyées, pour que la page de
        // confirmation et le suivi n'affichent jamais un chiffre différent de
        // ce qui a réellement été enregistré/facturé.
        if (apiData.booking.montantBase    != null) bookingData.baseTotal       = apiData.booking.montantBase;
        if (apiData.booking.montantOptions != null) bookingData.optionsTotal    = apiData.booking.montantOptions;
        if (apiData.booking.montantTotal   != null) { bookingData.montantTotal = apiData.booking.montantTotal; bookingData.total = apiData.booking.montantTotal; }
        if (apiData.booking.cautionAmount  != null) bookingData.cautionAmount   = apiData.booking.cautionAmount;
        if (apiData.booking.location?.deliveryFee != null) bookingData.deliveryFee = apiData.booking.location.deliveryFee;
        if (apiData.booking.commissionAmount != null) bookingData.commissionAmount = apiData.booking.commissionAmount;
        if (apiData.booking.partnerPayout    != null) bookingData.partnerPayout    = apiData.booking.partnerPayout;

        // Paiement en ligne (carte/Orange Money/Wave) : redirection vers la
        // page de paiement hébergée par le fournisseur (ou le mode simulé si
        // aucun compte marchand n'est configuré — voir server/services/payment/).
        // Les autres méthodes (cash, mtn/moov manuel...) gardent le parcours
        // existant : confirmation immédiate, règlement géré manuellement par la suite.
        if (["card", "orange_money", "wave"].includes(payMethod)) {
          let paymentInitFailed = false;
          try {
            const initRes = await fetch("/api/payments/initiate", {
              method: "POST", headers,
              body: JSON.stringify({ bookingId: apiData.booking._id, method: payMethod }),
            });
            const initData = await initRes.json().catch(() => ({}));
            if (initRes.ok && initData.checkoutUrl) {
              window.location.href = initData.checkoutUrl;
              return;
            }
            paymentInitFailed = true;
          } catch {
            paymentInitFailed = true;
          }
          // La réservation existe bien côté serveur (statut "pending"), mais le
          // paiement en ligne n'a pas pu être initié — le client doit le savoir
          // au lieu de croire sa réservation payée (voir BookingSuccess.jsx qui
          // affiche l'avertissement correspondant via payment.initFailed).
          if (paymentInitFailed) {
            toastError("La passerelle de paiement est momentanément indisponible. Votre réservation est enregistrée, complétez le paiement depuis votre tableau de bord.");
            setSubmitting(false);
            navigate("/booking/success", { state: { booking: bookingData, trial: isTrial, payment: { paymentMethod: payMethod, mobileNumber, initFailed: true } } });
            return;
          }
        }
      }
    } catch { /* mode hors-ligne — réservation locale uniquement */ }

    setSubmitting(false);
    navigate("/booking/success", { state: { booking: bookingData, trial: isTrial, payment: { paymentMethod: payMethod, mobileNumber } } });
  }, [form, pickupMethod, pickupAddress, pickupPosition, selectedOptions, payMethod, mobileNumber, cardNumber, cardHolder, days, deliveryFee, geoDistance, baseTotal, optionsTotal, totalToPay, kycOk, kycScore, kycBadge, bookingRef, isTrial, isLeasing, financingType, financingTerms, vehicle, token, user, addBooking, navigate, agencyFull, toastError]);

  /* ════════════════════════════════════════════════════════════════
     RENDU
     ════════════════════════════════════════════════════════════════ */

  if (!vehicle) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <span>🚗</span>
          <h2>Véhicule introuvable</h2>
          <p>Ce véhicule n'est plus disponible.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/catalogue")}>← Catalogue</button>
        </div>
      </div>
    );
  }

  /* ── KYC GATE ──────────────────────────────────────────────────── */
  if (!kycOk) {
    const isEnAttente = kycStatus === "EN_ATTENTE" && kycScore > 0;
    const isEnRevision = kycStatus === "A_REVOIR_MANUELLEMENT";
    const kycSteps = [
      { icon: "📧", label: "Email vérifié",            desc: "Confirmez votre adresse email" },
      { icon: "📱", label: "Téléphone confirmé",       desc: "Vérification par SMS" },
      { icon: "📄", label: "Photo du document",        desc: "CNI, Passeport ou Permis" },
      { icon: "🤳", label: "Selfie de vérification",   desc: "Comparaison avec le document" },
    ];
    return (
      <div className={styles.page}>
        <div className={styles.kycGate}>
          <div className={styles.kycGateHeader}>
            <div className={styles.kycGateLock}>🔒</div>
            <div>
              <h2 className={styles.kycGateTitle}>Vérification d'identité requise</h2>
              <p className={styles.kycGateVehicle}>
                Pour réserver <strong>{vehicle.title || vehicle.name}</strong>, votre identité doit être vérifiée.
              </p>
            </div>
          </div>

          {/* Statut en cours */}
          {(isEnAttente || isEnRevision) && (
            <div style={{ background: "#fef3c7", border: "1.5px solid #fde68a", borderRadius: 12, padding: "14px 18px", margin: "0 0 16px", fontSize: ".9rem", color: "#78350f" }}>
              {isEnRevision
                ? "🔍 Votre dossier KYC est actuellement en cours d'examen par notre équipe. Résultat sous 24h."
                : "⏳ Votre dossier KYC a été soumis. Notre équipe l'examine et vous notifiera sous 24 à 48h."}
            </div>
          )}

          {/* Score circulaire */}
          <div className={styles.kycGateScoreRing}>
            <svg viewBox="0 0 100 100" className={styles.kycRingSvg}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={kycBadge.color} strokeWidth="10"
                strokeDasharray={`${2.64 * kycScore} ${264 - 2.64 * kycScore}`}
                strokeLinecap="round" transform="rotate(-90 50 50)"
              />
            </svg>
            <div className={styles.kycRingInner}>
              <span className={styles.kycRingScore}>{kycScore}</span>
              <span className={styles.kycRingMax}>/100</span>
            </div>
          </div>

          <div className={styles.kycGateMissing}>
            <span className={styles.kycGateMissingBadge} style={{ background: kycBadge.bg, color: kycBadge.color }}>
              {kycBadge.emoji} {kycBadge.badge}
            </span>
            <p>Statut actuel : <strong>{kycStatus.replace(/_/g, " ")}</strong></p>
          </div>

          {!isEnAttente && !isEnRevision && (
            <div className={styles.kycGateSteps}>
              {kycSteps.map((s, i) => (
                <div key={i} className={styles.kycStep}>
                  <span className={styles.kycStepIcon}>{s.icon}</span>
                  <div>
                    <span className={styles.kycStepLabel}>{s.label}</span>
                    <span className={styles.kycStepDesc}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.kycGateActions}>
            {!isEnAttente && !isEnRevision && (
              <button className={styles.kycGateCta}
                onClick={() => navigate(`/kyc?returnTo=/booking/${id}${searchParams.get("type") ? "&type=" + searchParams.get("type") : ""}`)}>
                🛡️ Vérifier mon identité
              </button>
            )}
            <button className={styles.secondaryBtn} onClick={() => navigate(-1)}>← Retour</button>
          </div>

          <p className={styles.kycGateNote}>
            🔐 Vos données sont chiffrées et ne sont jamais partagées sans votre consentement.
          </p>
        </div>
      </div>
    );
  }

  // Restreint les moyens de paiement à ceux activés par l'admin pour le pays du
  // véhicule (CountryConfig.paymentMethods) — voir Checkout.jsx pour le même mécanisme.
  const allowedPaymentMethods = getPaymentMethodsForCountry(vehicle.country || catalogCountry || countryCode);
  const visiblePaymentMethods = allowedPaymentMethods
    ? PAYMENT_METHODS.filter((pm) => allowedPaymentMethods.includes(pm.value))
    : PAYMENT_METHODS;

  return (
    <div className={styles.page}>
      {/* ── Contenu principal ───────────────────────────── */}
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>
          {isTrial ? "🔑 Demande d'essai" : isLeasing ? (financingType === "credit" ? "💳 Réserver ce crédit" : "💳 Réserver ce leasing") : "📅 Réserver ce véhicule"}
        </h1>

        {/* KYC Badge */}
        <div className={styles.kycBadgeBar} style={{ background: kycBadge.bg, borderColor: kycBadge.border }}>
          <span>{kycBadge.emoji}</span>
          <span style={{ color: kycBadge.color, fontWeight: 700 }}>{kycBadge.badge}</span>
          <span style={{ color: "#5a6a8a", fontSize: "0.82rem" }}>— Identité vérifiée • {kycScore}/100</span>
          <span className={styles.kycRef}>Réf. future : <strong>{bookingRef}</strong></span>
        </div>

        {/* ── Progress steps ──────────────────────────── */}
        <div className={styles.stepIndicator}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`${styles.stepBtn} ${step === s.id ? styles.stepActive : ""} ${step > s.id ? styles.stepDone : ""}`}
            >
              {step > s.id ? "✓ " : ""}{s.label}
            </div>
          ))}
        </div>

        {/* ════ ÉTAPE 1 — DATES & PRISE EN CHARGE ════════ */}
        {step === 1 && (
          <div className={styles.section}>
            {/* Infos client */}
            <h3 className={styles.sectionTitle}>Coordonnées</h3>
            <div className={styles.row}>
              <input className={styles.input} type="text"  placeholder="Prénom *" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <input className={styles.input} type="text"  placeholder="Nom *" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className={styles.row}>
              <input className={styles.input} type="email" placeholder="E-mail *" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className={styles.input} type="tel"   placeholder="Téléphone *" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>

            {/* Essai / Leasing / Location */}
            {isLeasing ? (
              <>
                <h3 className={styles.sectionTitle}>💳 Conditions du leasing</h3>
                <p className={styles.optionsNote} style={{ marginBottom: 12 }}>
                  Ce véhicule est proposé par le partenaire avec les conditions de financement suivantes — non modifiables à cette étape.
                </p>
                <div className={styles.confirmRows}>
                  <div className={styles.confirmRow}><span>Apport initial</span><strong>{fmt(financingTerms?.apportInitial || 0)}</strong></div>
                  <div className={styles.confirmRow}><span>Mensualité</span><strong>{fmt(financingTerms?.mensualite || 0)} / mois</strong></div>
                  <div className={styles.confirmRow}><span>Durée</span><strong>{financingTerms?.duree || 36} mois</strong></div>
                  <div className={styles.confirmRow}><span>Taux d'intérêt</span><strong>{financingTerms?.tauxInteret || 8}% / an</strong></div>
                  {financingTerms?.description && (
                    <div className={styles.confirmRow}><span>Conditions</span><strong>{financingTerms.description}</strong></div>
                  )}
                </div>
                <label className={styles.optionCard} style={{ marginTop: 16, cursor: "pointer" }}>
                  <input type="checkbox" className={styles.optionCheckbox}
                    checked={leasingAccepted}
                    onChange={(e) => setLeasingAccepted(e.target.checked)} />
                  <span>J'ai lu et j'accepte les conditions de ce leasing. L'apport initial sera exigé pour confirmer la réservation ; le reste est payé directement au partenaire selon l'échéancier ci-dessus.</span>
                </label>
              </>
            ) : isTrial ? (
              <>
                <h3 className={styles.sectionTitle}>Date d'essai</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  Choisissez un créneau pour venir essayer le véhicule (environ 1h). Le partenaire confirmera le rendez-vous.
                </p>
                <div className={styles.row}>
                  <label className={styles.label}>
                    Date préférée
                    <input className={styles.input} type="date" value={form.preferredDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} required />
                  </label>
                  <label className={styles.label}>
                    Heure préférée
                    <input className={styles.input} type="time" value={form.preferredTime}
                      onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} required />
                  </label>
                </div>
                {essaiConflict && (
                  <div className={styles.blockedNotice}>
                    ⛔ Un autre essai est déjà prévu sur ce créneau ({new Date(essaiConflict.date).toLocaleString("fr-FR")}). Choisissez une autre heure.
                  </div>
                )}
                <textarea className={styles.textarea} placeholder="Notes (optionnel)"
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </>
            ) : (
              <>
                <h3 className={styles.sectionTitle}>Dates de location</h3>
                {blockedDays.length > 0 && (
                  <div className={styles.blockedNotice}>
                    ⚠️ {blockedDays.length} jour{blockedDays.length > 1 ? "s" : ""} déjà réservé{blockedDays.length > 1 ? "s" : ""} sur ce véhicule.
                  </div>
                )}
                <div className={styles.row}>
                  <label className={styles.label}>
                    Début *
                    <input className={`${styles.input} ${form.startDate && blockedSet.has(form.startDate) ? styles.inputBlocked : ""}`}
                      type="date" value={form.startDate} min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                    {form.startDate && blockedSet.has(form.startDate) && <span className={styles.blockedMsg}>⛔ Date réservée</span>}
                  </label>
                  <label className={styles.label}>
                    Fin *
                    <input className={`${styles.input} ${form.endDate && blockedSet.has(form.endDate) ? styles.inputBlocked : ""}`}
                      type="date" value={form.endDate} min={form.startDate || new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                    {form.endDate && blockedSet.has(form.endDate) && <span className={styles.blockedMsg}>⛔ Date réservée</span>}
                  </label>
                </div>
                {days > 0 && <p className={styles.daysLabel}>📅 {days} jour{days > 1 ? "s" : ""} de location</p>}

                {/* Mode prise en charge */}
                <h3 className={styles.sectionTitle}>Mode de prise en charge</h3>
                <div className={styles.pickupCards}>
                  <div
                    className={`${styles.pickupCard} ${pickupMethod === "retrait" ? styles.pickupCardActive : ""}`}
                    onClick={() => setPickupMethod("retrait")}
                  >
                    <span>🏢</span>
                    <div>
                      <strong>Retrait en agence</strong>
                      <span>Gratuit — {agencyFull || "Adresse communiquée après confirmation"}</span>
                    </div>
                    <div className={styles.radioIndicator}>{pickupMethod === "retrait" ? "●" : "○"}</div>
                  </div>
                  <div
                    className={`${styles.pickupCard} ${pickupMethod === "livraison" ? styles.pickupCardActive : ""}`}
                    onClick={() => setPickupMethod("livraison")}
                  >
                    <span>🚚</span>
                    <div>
                      <strong>Livraison à domicile</strong>
                      <span>Le partenaire livre le véhicule chez vous</span>
                    </div>
                    <div className={styles.radioIndicator}>{pickupMethod === "livraison" ? "●" : "○"}</div>
                  </div>
                </div>

                {pickupMethod === "livraison" && (
                  <div className={styles.deliveryBlock}>
                    <button
                      type="button"
                      className={`${styles.gpsBtn} ${gpsState === "ok" ? styles.gpsBtnOk : ""}`}
                      onClick={handleDetectGPS}
                      disabled={gpsState === "loading"}
                    >
                      {gpsState === "loading" ? "⏳ Détection…" : gpsState === "ok" ? "✓ Position détectée" : "🎯 Détecter ma position GPS"}
                    </button>
                    {gpsError && <p className={styles.errorMsg}>⚠️ {gpsError}</p>}
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Votre adresse de livraison"
                      value={pickupAddress}
                      onChange={(e) => { setPickupAddress(e.target.value); if (!e.target.value) { setPickupPosition(null); setGeoDistance(null); setGeoFee(null); } }}
                    />
                    {pickupMethod === "livraison" && (
                      <div className={styles.deliveryFeeBox}>
                        <div className={styles.deliveryFeeRow}>
                          <span>🚚 Frais de livraison</span>
                          {geoFeeLoading ? <span>Calcul…</span>
                            : geoFee != null ? <strong className={styles.feeAmount}>{fmt(deliveryFee)}</strong>
                            : <span className={styles.feePending}>Activez le GPS pour calculer</span>}
                        </div>
                        {geoDistance && <p className={styles.distanceLabel}>📏 Distance estimée : {geoDistance} km</p>}
                      </div>
                    )}
                  </div>
                )}

                {pickupMethod === "retrait" && agencyFull && (
                  <div className={styles.agencyCard}>
                    <span>📍</span>
                    <div>
                      <strong>{agencyName}</strong>
                      <span>{agencyFull}</span>
                      {agencyPhone && <a href={`tel:${agencyPhone}`} className={styles.agencyPhone}>{agencyPhone}</a>}
                    </div>
                    <div className={styles.freeBadge}>Gratuit</div>
                  </div>
                )}
              </>
            )}

            <div className={styles.actionRow}>
              <div />
              <button
                className={styles.primaryBtn}
                onClick={() => setStep(isLeasing ? 3 : 2)}
                disabled={
                  !form.firstName || !form.lastName || !form.email || !form.phone ||
                  (isLeasing && !leasingAccepted) ||
                  (!isTrial && !isLeasing && (!form.startDate || !form.endDate || days <= 0)) ||
                  (isTrial && (!form.preferredDate || !form.preferredTime || !!essaiConflict)) ||
                  (!isLeasing && pickupMethod === "livraison" && !pickupAddress.trim())
                }
              >
                Suivant →
              </button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 2 — OPTIONS ════════════════════════ */}
        {step === 2 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Options supplémentaires</h3>
            <p className={styles.optionsNote}>Tarif par jour × {Math.max(days, 1)} jour{days > 1 ? "s" : ""}</p>

            <div className={styles.optionsGrid}>
              {OPTIONS_CATALOG.map((opt) => (
                <label key={opt.id} className={`${styles.optionCard} ${selectedOptions[opt.id] ? styles.optionCardActive : ""}`}>
                  <input type="checkbox" className={styles.optionCheckbox}
                    checked={selectedOptions[opt.id]}
                    onChange={(e) => setSelectedOptions({ ...selectedOptions, [opt.id]: e.target.checked })} />
                  <span className={styles.optionIcon}>{opt.icon}</span>
                  <div className={styles.optionInfo}>
                    <strong>{opt.label}</strong>
                    <span>+{fmt(opt.price)}/jour</span>
                  </div>
                  {selectedOptions[opt.id] && <span className={styles.optionCheck}>✓</span>}
                </label>
              ))}
            </div>

            {optionsTotal > 0 && (
              <div className={styles.optionsTotalBar}>
                Options sélectionnées : <strong>{fmt(optionsTotal)}</strong>
              </div>
            )}

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(1)}>← Retour</button>
              <button className={styles.primaryBtn} onClick={() => setStep(3)}>Suivant →</button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 3 — PAIEMENT ═══════════════════════ */}
        {step === 3 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Méthode de paiement</h3>

            <div className={styles.payMethodGrid}>
              {visiblePaymentMethods.map((pm) => (
                <label key={pm.value} className={`${styles.payCard} ${payMethod === pm.value ? styles.payCardActive : ""}`}>
                  <input type="radio" name="payMethod" value={pm.value}
                    checked={payMethod === pm.value} onChange={() => setPayMethod(pm.value)} />
                  <span className={styles.payIcon}>{pm.icon}</span>
                  <span className={styles.payLabel}>{pm.label}</span>
                </label>
              ))}
            </div>

            {["orange_money", "wave", "mtn", "moov"].includes(payMethod) && (
              <div className={styles.payDetails}>
                <label className={styles.label}>
                  Numéro mobile *
                  <input className={styles.input} type="tel" placeholder="+225 07 00 00 00 00"
                    value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} required />
                </label>
              </div>
            )}

            {payMethod === "cash" && (
              <div className={styles.payDetails}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem", color: "#1e3a8a" }}>
                  💵 Le règlement se fera <strong>en espèces à la remise du véhicule</strong>, directement auprès du partenaire.
                  Un reçu de paiement au format PDF vous sera automatiquement envoyé par email dès que la transaction sera validée.
                </div>
              </div>
            )}

            {payMethod === "card" && (
              <div className={styles.payDetails}>
                <div className={styles.row}>
                  <label className={styles.label}>
                    Numéro de carte *
                    <input className={styles.input} type="text" placeholder="0000 0000 0000 0000"
                      value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} maxLength={19} />
                  </label>
                  <label className={styles.label}>
                    Nom sur la carte *
                    <input className={styles.input} type="text" placeholder="NOM PRÉNOM"
                      value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} />
                  </label>
                </div>
                <div className={styles.row}>
                  <label className={styles.label}>
                    Expiration (MM/AA) *
                    <input className={styles.input} type="text" placeholder="MM/AA"
                      value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} maxLength={5} />
                  </label>
                  <label className={styles.label}>
                    CVV *
                    <input className={styles.input} type="text" placeholder="123"
                      value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} maxLength={4} />
                  </label>
                </div>
              </div>
            )}

            <div className={styles.securityNote}>
              🔐 Paiement sécurisé TLS 1.3 — Données chiffrées · CVV jamais stocké sur nos serveurs
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: "0.8rem", color: "#92400e", marginTop: 8 }}>
              ⚠️ <strong>Mode simulation actif</strong> — Aucun débit réel. L'intégration Orange Money / Stripe sera activée en production.
            </div>

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(isLeasing ? 1 : 2)}>← Retour</button>
              <button
                className={styles.primaryBtn}
                onClick={() => setStep(4)}
                disabled={
                  (["orange_money","wave","mtn","moov"].includes(payMethod) && !mobileNumber) ||
                  (payMethod === "card" && (!cardNumber || !cardHolder || !cardExpiry || !cardCvv))
                }
              >
                Voir le récapitulatif →
              </button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 4 — CONFIRMATION ═══════════════════ */}
        {step === 4 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>✅ Récapitulatif de la réservation</h3>

            <div className={styles.refBox}>
              <span>Référence</span>
              <strong className={styles.refCode}>{bookingRef}</strong>
            </div>

            <div className={styles.confirmRows}>
              <div className={styles.confirmRow}><span>Client</span><strong>{form.firstName} {form.lastName}</strong></div>
              <div className={styles.confirmRow}><span>Email</span><strong>{form.email}</strong></div>
              <div className={styles.confirmRow}><span>Téléphone</span><strong>{form.phone}</strong></div>
              <div className={styles.confirmRow}><span>Véhicule</span><strong>{vehicle.title || vehicle.name}</strong></div>
              {!isTrial && !isLeasing && (
                <>
                  <div className={styles.confirmRow}><span>Du</span><strong>{new Date(form.startDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>Au</span><strong>{new Date(form.endDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>Durée</span><strong>{days} jour{days > 1 ? "s" : ""}</strong></div>
                  <div className={styles.confirmRow}><span>Prise en charge</span><strong>{pickupMethod === "retrait" ? `Retrait — ${agencyFull || "Agence"}` : `Livraison — ${pickupAddress.slice(0, 50)}`}</strong></div>
                  {baseTotal > 0 && <div className={styles.confirmRow}><span>Base</span><strong>{fmt(baseTotal)}</strong></div>}
                  {optionsTotal > 0 && <div className={styles.confirmRow}><span>Options</span><strong>{fmt(optionsTotal)}</strong></div>}
                  {pickupMethod === "livraison" && <div className={styles.confirmRow}><span>Livraison</span><strong>{fmt(deliveryFee)}</strong></div>}
                </>
              )}
              {isTrial && (
                <>
                  <div className={styles.confirmRow}><span>Date d'essai</span><strong>{new Date(form.preferredDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>Heure</span><strong>{form.preferredTime}</strong></div>
                </>
              )}
              {isLeasing && (
                <>
                  <div className={styles.confirmRow}><span>Apport initial</span><strong>{fmt(baseTotal)}</strong></div>
                  <div className={styles.confirmRow}><span>Mensualité</span><strong>{fmt(financingTerms?.mensualite || 0)} / mois</strong></div>
                  <div className={styles.confirmRow}><span>Durée</span><strong>{financingTerms?.duree || 36} mois</strong></div>
                </>
              )}
              <div className={styles.confirmRow}><span>Frais de service</span><strong>{fmt(SERVICE_FEE)}</strong></div>
              <div className={styles.confirmRow}><span>Paiement</span><strong>{PAYMENT_METHODS.find((p) => p.value === payMethod)?.label || payMethod}</strong></div>
              <div className={`${styles.confirmRow} ${styles.confirmTotal}`}>
                <span>Total à payer</span>
                <strong>{fmt(totalToPay)}</strong>
              </div>
            </div>

            <div className={styles.kycBadgeBar} style={{ background: kycBadge.bg, borderColor: kycBadge.border }}>
              {kycBadge.emoji} <span style={{ color: kycBadge.color, fontWeight: 700 }}>{kycBadge.badge}</span>
              <span style={{ color: "#5a6a8a", fontSize: "0.82rem" }}> — Identité vérifiée</span>
            </div>

            <div className={styles.legalNote}>
              En confirmant, vous acceptez les{" "}
              <Link to="/cgu" target="_blank">conditions générales</Link>{" "}
              et la{" "}
              <Link to="/privacy" target="_blank">politique de confidentialité</Link> de VIT AUTO.
            </div>

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(3)}>← Modifier</button>
              <button className={styles.confirmBtn} onClick={handleSubmit} disabled={submitting}>
                {submitting ? "⏳ Envoi…" : `✅ Confirmer — ${fmt(totalToPay)}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar récapitulatif ──────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarCard}>
          <div className={styles.vehicleThumb}>
            <img
              src={vehicle.images?.[0] || vehicle.image}
              alt={vehicle.title || vehicle.name}
              onError={(e) => { e.target.style.display = "none"; }}
            />
            <span className={styles.vehicleThumbTitle}>{vehicle.title || vehicle.name}</span>
          </div>

          <div className={styles.sidebarRows}>
            {isLeasing ? (
              <>
                <div className={styles.sidebarRow}><span>Apport initial</span><strong>{fmt(baseTotal)}</strong></div>
                <div className={styles.sidebarRow}><span>Mensualité</span><strong>{fmt(financingTerms?.mensualite || 0)}/mois</strong></div>
                <div className={styles.sidebarRow}><span>Durée</span><strong>{financingTerms?.duree || 36} mois</strong></div>
              </>
            ) : (
              <>
                {!isTrial && <div className={styles.sidebarRow}><span>Prix / jour</span><strong>{fmt(vehicle.pricePerDay || 0)}</strong></div>}
                {days > 0 && !isTrial && <div className={styles.sidebarRow}><span>Durée</span><strong>{days} j</strong></div>}
                {baseTotal > 0 && !isTrial && <div className={styles.sidebarRow}><span>Base</span><strong>{fmt(baseTotal)}</strong></div>}
                {optionsTotal > 0 && <div className={styles.sidebarRow}><span>Options</span><strong>{fmt(optionsTotal)}</strong></div>}
                {pickupMethod === "livraison" && !isTrial && (
                  <div className={styles.sidebarRow}>
                    <span>Livraison{geoDistance ? ` (${geoDistance}km)` : ""}</span>
                    <strong>{geoFeeLoading ? "…" : fmt(deliveryFee)}</strong>
                  </div>
                )}
                {pickupMethod === "retrait" && !isTrial && (
                  <div className={styles.sidebarRow}><span>Retrait agence</span><strong className={styles.freeLabel}>Gratuit</strong></div>
                )}
              </>
            )}
            <div className={styles.sidebarRow}><span>Frais service</span><strong>{fmt(SERVICE_FEE)}</strong></div>
            <div className={`${styles.sidebarRow} ${styles.sidebarTotal}`}>
              <span>Total</span>
              <strong>{fmt(totalToPay)}</strong>
            </div>
          </div>

          <div className={styles.sidebarKyc} style={{ borderColor: kycBadge.border, background: kycBadge.bg }}>
            {kycBadge.emoji} <span style={{ color: kycBadge.color, fontWeight: 700, fontSize: "0.82rem" }}>
              {kycBadge.badge} — {kycScore}/100
            </span>
          </div>

          <div className={styles.sidebarGuarantee}>
            🛡️ Identité vérifiée · Paiement sécurisé · Contrat digital
          </div>
        </div>
      </aside>
    </div>
  );
}
