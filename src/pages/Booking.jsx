import { useParams, useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth }     from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useToast }    from "../context/ToastContext";
import { haversineKm, geocodeAddress, getCurrentPosition, reverseGeocode } from "../utils/geo";
import { getKycBadge, generateBookingRef } from "../utils/kycEngine.js";
import { selectBestPromotionRule, effectivePricePerDay as computeEffectivePricePerDay } from "../utils/promotion";
import { computeLocationTotal as computeSeasonalLocationTotal } from "../utils/seasonalPricing";
import { getCustomerServiceContact } from "../utils/customerServiceContact";
import { useI18n } from "../context/I18nContext";
import PriceTag from "../components/PriceTag/PriceTag";
import DeliveryMapPicker from "../components/DeliveryMapPicker/DeliveryMapPicker";
import styles from "./Booking.module.css";

/* ── Constantes financières (USD — voir PricingConfig.serviceFee/rentalOptions
   côté serveur ; ceci n'est qu'un aperçu client avant soumission, le serveur
   recalcule et fait toujours foi à la création — voir bookingController.js) ── */
const SERVICE_FEE     = 1;      // plancher serviceFee.minUSD (PricingConfig)
const DELIVERY_BASE   = 3;      // repli si /api/geo/delivery-fee échoue
const DELIVERY_PER_KM = 0.5;    // repli si /api/geo/delivery-fee échoue

// label = clé de traduction (voir src/i18n/translations.js), résolue via t()
// au moment du rendu — ces constantes vivent hors du composant donc ne
// peuvent pas appeler le hook useI18n() directement.
const OPTIONS_CATALOG = [
  { id: "babySeat",  label: "booking.optionBabySeat",  price: 11.67, icon: "👶" },
  { id: "insurance", label: "booking.optionInsurance", price: 25,    icon: "🛡️" },
  { id: "driver",    label: "booking.optionDriver",    price: 83.33, icon: "🧑‍✈️" },
  { id: "gps",       label: "booking.optionGps",       price: 16.67, icon: "🗺️" },
];

// Moyens de paiement disponibles au choix du client (voir Checkout.jsx/DriverBooking.jsx).
// Orange Money/Wave/MTN/Moov sont des noms de marque, jamais traduits.
const PAYMENT_METHODS = [
  { value: "orange_money", label: "Orange Money",           icon: "🟠", mobile: true },
  { value: "wave",         label: "Wave",                    icon: "🔵", mobile: true },
  { value: "mtn",          label: "MTN Mobile Money",        icon: "💛", mobile: true },
  { value: "moov",         label: "Moov Money",              icon: "🟢", mobile: true },
  { value: "card",         label: "booking.paymentCard",     icon: "💳", mobile: false, translate: true },
  { value: "cash",         label: "booking.paymentCash",     icon: "💵", mobile: false, translate: true },
];

const STEPS = [
  { id: 1, label: "booking.step1Label" },
  { id: 2, label: "booking.step2Label" },
  { id: 3, label: "booking.step3Label" },
  { id: 4, label: "booking.step4Label" },
];

/* ════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ════════════════════════════════════════════════════════════════ */
export default function Booking() {
  const { id }          = useParams();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const location        = useLocation();
  const { fmt, getPaymentMethodsForCountry, catalogCountry, countryCode } = useCurrency();
  const { vehicles, addBooking, removeLocalBooking, getItemById } = useVehicles();
  const { token, user } = useAuth();
  const { error: toastError } = useToast();
  const { t } = useI18n();

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
  // Booking Engine — livraison (2026-09) : champs structurés optionnels +
  // sélecteur de carte (voir DeliveryMapPicker), en plus de la détection GPS
  // et de la saisie libre déjà existantes.
  const [deliveryCity,         setDeliveryCity]         = useState("");
  const [deliveryPostalCode,   setDeliveryPostalCode]   = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [showMapPicker,        setShowMapPicker]        = useState(false);
  const [gpsError,       setGpsError]       = useState("");
  const [geoDistance,    setGeoDistance]    = useState(null);
  const [geoFee,         setGeoFee]         = useState(null);
  const [geoFeeLoading,  setGeoFeeLoading]  = useState(false);
  const [leasingAccepted, setLeasingAccepted] = useState(false);

  /* ── Documents liés à LA RÉSERVATION (restructuration 2026-09) ───────────
     Demandés en dernière étape, pour conclure la réservation — jamais avant.
     Pas d'OCR ni de revue manuelle : l'image est jointe telle quelle à cette
     commande, transmise au partenaire et conservée pour l'admin en cas de
     litige (voir bookingController.createBooking). Un client déjà
     kycStatus VERIFIE (ancien parcours /kyc) n'a rien à fournir. ────────── */
  const [idType,             setIdType]             = useState("cni");
  const [idFrontImage,       setIdFrontImage]       = useState(null);
  const [idBackImage,        setIdBackImage]        = useState(null);
  const [licenseFrontImage,  setLicenseFrontImage]  = useState(null);
  const [licenseBackImage,   setLicenseBackImage]   = useState(null);
  const [docError,           setDocError]           = useState("");

  const readImageFile = useCallback((file, setter) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setDocError(t("booking.docFormatError")); return; }
    if (file.size > 6 * 1024 * 1024) { setDocError(t("booking.docSizeError")); return; }
    setDocError("");
    const reader = new FileReader();
    reader.onload = (e) => setter(e.target.result);
    reader.readAsDataURL(file);
  }, [t]);

  // Location classique uniquement (hors essai/leasing, gérés séparément —
  // voir suggestion de parcours dédiée) : identité toujours requise, permis
  // requis sauf véhicule avec chauffeur (Vehicle.withDriver).
  const showDocumentStep = !isTrial && !isLeasing;
  const needsLicenseDoc  = showDocumentStep && !vehicle?.withDriver && vehicleRequiresLicense;
  const identitySatisfied = kycStatus === "VERIFIE" || !!idFrontImage;
  const licenseSatisfied  = !needsLicenseDoc || hasVerifiedLicense || !!licenseFrontImage;
  const documentsReady = !showDocumentStep || (identitySatisfied && licenseSatisfied);

  /* ── STEP 2 : Options ──────────────────────────────────────────── */
  const [selectedOptions, setSelectedOptions] = useState({ babySeat: false, insurance: false, driver: false, gps: false });
  // Fidélité — voir bookingController.createBooking pour le calcul autoritaire
  // (jamais confiance dans ce montant côté client, uniquement un aperçu).
  const [applyPoints, setApplyPoints] = useState(false);

  /* ── STEP 3 : Paiement ─────────────────────────────────────────── */
  const [payMethod,      setPayMethod]      = useState("orange_money");
  const [mobileNumber,   setMobileNumber]   = useState(user?.phone || "");
  const [cardNumber,     setCardNumber]     = useState("");
  const [cardHolder,     setCardHolder]     = useState("");
  const [cardExpiry,     setCardExpiry]     = useState("");
  const [cardCvv,        setCardCvv]        = useState("");

  // Location (hors essai/leasing) : un seul moyen de paiement possible
  // (espèces) — voir `isRentalOnly`/`visiblePaymentMethods` plus bas. Corrige
  // le défaut "orange_money" dès que isTrial/isLeasing sont connus (dépendent
  // de vehicle/financingTerms, potentiellement résolus après le premier rendu).
  useEffect(() => {
    if (!isTrial && !isLeasing) setPayMethod("cash");
  }, [isTrial, isLeasing]);

  /* ── Infos partenaire ──────────────────────────────────────────── */
  const agencyName    = vehicle?.contactNom  || vehicle?.ownerName  || "Partenaire VIT AUTO";
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
  // Meilleure règle de promotion pour la durée réellement sélectionnée
  // (affichage uniquement — même logique que VehicleCard.jsx/
  // server/utils/promotion.js ; le prix réellement facturé reste toujours
  // recalculé et autoritaire côté serveur dans createBooking).
  const promoBaseTotal = (vehicle?.pricePerDay || 0) * Math.max(days, 1);
  const activePromo = selectBestPromotionRule(vehicle?.promotions, Math.max(days, 1), promoBaseTotal);
  const promoActive = !!activePromo;
  const effectivePricePerDay = Math.round(computeEffectivePricePerDay(vehicle?.pricePerDay || 0, Math.max(days, 1), vehicle?.promotions));
  // Tarification saisonnière (Vehicle.seasonalRates, voir src/utils/seasonalPricing.js) —
  // même calcul jour par jour que le serveur (bookingController.createBooking),
  // pour que l'estimation affichée avant envoi corresponde au montant réellement
  // facturé (apiData.booking.montantBase reste toujours autoritaire, voir plus bas).
  const baseTotal    = isLeasing
    ? (financingTerms?.apportInitial || 0)
    : computeSeasonalLocationTotal(vehicle, form.startDate, Math.max(days, 1));
  // Fidélité — aperçu client uniquement (voir bookingController.createBooking
  // pour le plafond/débit réels et autoritaires côté serveur, même règle
  // reproduite ici : 100 points = 1 USD, max 20% de baseTotal).
  const maxPointsUsable = Math.max(0, Math.min(user?.loyaltyPoints || 0, Math.floor(baseTotal * 0.2 * 100)));
  const pointsToApply   = applyPoints ? maxPointsUsable : 0;
  const loyaltyDiscountPreview = pointsToApply / 100;
  const totalToPay   = isTrial ? SERVICE_FEE
    : isLeasing ? baseTotal + SERVICE_FEE
    : Math.max(baseTotal + optionsTotal + deliveryFee + SERVICE_FEE - loyaltyDiscountPreview, 0);

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
          (e) => rej(new Error(e.code === 1 ? t("booking.gpsDeniedError") : t("booking.gpsUnavailableError"))),
          { enableHighAccuracy: true, timeout: 12000 }
        )
      );
      const result = await reverseGeocode(pos.lat, pos.lng);
      setPickupPosition(pos);
      setPickupAddress(result?.address || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      setDeliveryCity(result?.city || "");
      setDeliveryPostalCode(result?.postalCode || "");
      setGpsState("ok");
    } catch (err) {
      setGpsState("error");
      setGpsError(err.message);
    }
  };

  // Booking Engine — livraison (2026-09) : confirmation depuis le sélecteur
  // de carte (voir DeliveryMapPicker) — même état que la détection GPS/la
  // saisie manuelle, juste une 3e façon de le renseigner.
  const handleMapConfirm = ({ lat, lng, address, city, postalCode }) => {
    setPickupPosition({ lat, lng });
    setPickupAddress(address || "");
    setDeliveryCity(city || "");
    setDeliveryPostalCode(postalCode || "");
    setGpsState("ok");
    setShowMapPicker(false);
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
    // Bug réel corrigé (audit) : rien n'empêchait un double-clic/double-tap
    // rapide (fréquent en fin de tunnel de paiement mobile) de déclencher deux
    // POST /api/bookings pour la même réservation — seul l'attribut
    // disabled={submitting} du bouton protégeait, mais React ne le reflète à
    // l'écran qu'au rendu suivant, laissant une fenêtre réelle pour un double
    // appel avant que le bouton ne soit visuellement désactivé.
    if (submitting) return;
    // Booking Engine (2026-09) : POST /api/bookings exige désormais un compte
    // (voir routes/bookings.js) — la réservation invité n'est plus possible.
    if (!token) {
      navigate("/login", { state: { from: { pathname: location.pathname + location.search } } });
      return;
    }
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
        // Fidélité — voir bookingController.createBooking pour le calcul
        // autoritaire (plafond 20% de montantBase, débit atomique conditionnel).
        // pointsToApply reste purement indicatif côté client pour l'aperçu affiché.
        ...(!isTrial && !isLeasing && pointsToApply > 0 ? { pointsToRedeem: pointsToApply } : {}),
        clientInfo: {
          ...bookingData.clientInfo,
          kycStatus: kycStatus,
          kycScore:  kycScore,
          kycBadge:  kycBadge.badge,
          kycVerified: kycOk,
        },
        // Documents liés à LA RÉSERVATION (restructuration 2026-09) — voir
        // bookingController.createBooking. Rien à envoyer si le client est
        // déjà kycStatus VERIFIE (ancien parcours /kyc) ou hors location.
        ...(showDocumentStep && (idFrontImage || licenseFrontImage) ? {
          documents: {
            ...(idFrontImage ? { identity: { type: idType, frontImage: idFrontImage, backImage: idBackImage || undefined } } : {}),
            ...(licenseFrontImage ? { license: { frontImage: licenseFrontImage, backImage: licenseBackImage || undefined } } : {}),
          },
        } : {}),
        ...((!isTrial && !isLeasing) ? {
          location: {
            startDate:      form.startDate,
            endDate:        form.endDate,
            days,
            pickupMethod,
            pickupLocation: finalPickup,
            pickupPosition: pickupMethod === "livraison" && pickupPosition
              ? { ...pickupPosition, address: pickupAddress, city: deliveryCity || null, postalCode: deliveryPostalCode || null, instructions: deliveryInstructions || null }
              : null,
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
        bookingData.isFirstBooking = !!apiData.isFirstBooking;

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
            toastError(t("booking.paymentGatewayDownError"));
            setSubmitting(false);
            navigate("/booking/success", { state: { booking: bookingData, trial: isTrial, payment: { paymentMethod: payMethod, mobileNumber, initFailed: true } } });
            return;
          }
        }
      } else {
        // Le serveur a répondu mais a refusé la création (véhicule indisponible,
        // KYC insuffisant, créneau déjà pris, etc.) — ne jamais afficher l'écran
        // "Réservation confirmée" tant qu'aucune réservation n'existe en base.
        removeLocalBooking(bookingRef);
        toastError(apiData.message || t("booking.submitFailedGenericError"));
        // Booking Engine (2026-09) — dirige directement vers l'écran de
        // vérification concerné plutôt que de laisser le client deviner quoi
        // faire à partir du seul message d'erreur.
        if (apiData.code === "VERIFICATION_LEVEL_1_REQUIRED") navigate("/profile");
        if (apiData.code === "VERIFICATION_LEVEL_2_REQUIRED") navigate("/kyc");
        setSubmitting(false);
        return;
      }
    } catch {
      // Bug réel corrigé (audit) : ce catch était vide et l'exécution retombait
      // sur la navigation de succès juste en dessous — une vraie panne réseau
      // (pas juste un refus serveur) affichait quand même "Réservation
      // confirmée" alors qu'aucune requête n'avait jamais abouti. Même
      // traitement que le refus serveur explicite ci-dessus : jamais de faux
      // succès, retrait de la réservation optimiste fantôme.
      removeLocalBooking(bookingRef);
      toastError(t("booking.networkLostError"));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    navigate("/booking/success", { state: { booking: bookingData, trial: isTrial, payment: { paymentMethod: payMethod, mobileNumber } } });
  }, [submitting, form, pickupMethod, pickupAddress, pickupPosition, deliveryCity, deliveryPostalCode, deliveryInstructions, selectedOptions, payMethod, mobileNumber, cardNumber, cardHolder, days, deliveryFee, geoDistance, baseTotal, optionsTotal, totalToPay, kycOk, kycScore, kycBadge, bookingRef, isTrial, isLeasing, financingType, financingTerms, vehicle, token, user, addBooking, removeLocalBooking, navigate, location, agencyFull, toastError, showDocumentStep, idType, idFrontImage, idBackImage, licenseFrontImage, licenseBackImage]);

  /* ════════════════════════════════════════════════════════════════
     RENDU
     ════════════════════════════════════════════════════════════════ */

  if (!vehicle) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <span>🚗</span>
          <h2>{t("booking.vehicleNotFoundTitle")}</h2>
          <p>{t("booking.vehicleNotFoundDesc")}</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/catalogue")}>{t("booking.backToCatalogue")}</button>
        </div>
      </div>
    );
  }

  // Restreint les moyens de paiement à ceux activés par l'admin pour le pays du
  // véhicule (CountryConfig.paymentMethods) — voir Checkout.jsx pour le même mécanisme.
  const allowedPaymentMethods = getPaymentMethodsForCountry(vehicle.country || catalogCountry || countryCode);
  // Décision produit (2026-09) : la location (hors essai/leasing, voir `type`
  // ci-dessus) passe exclusivement en espèces en attendant la configuration
  // des vraies clés de paiement — bookingController.createBooking applique le
  // même filet côté serveur, indépendamment de ce que ce composant envoie.
  const isRentalOnly = !isTrial && !isLeasing;
  const visiblePaymentMethods = isRentalOnly
    ? PAYMENT_METHODS.filter((pm) => pm.value === "cash")
    : allowedPaymentMethods
      ? PAYMENT_METHODS.filter((pm) => allowedPaymentMethods.includes(pm.value))
      : PAYMENT_METHODS;

  return (
    <div className={styles.page}>
      {/* ── Contenu principal ───────────────────────────── */}
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>
          {isTrial ? t("booking.titleTrial") : isLeasing ? (financingType === "credit" ? t("booking.titleCredit") : t("booking.titleLeasing")) : t("booking.titleRental")}
        </h1>

        {/* KYC Badge */}
        <div className={styles.kycBadgeBar} style={{ background: kycBadge.bg, borderColor: kycBadge.border }}>
          <span>{kycBadge.emoji}</span>
          <span style={{ color: kycBadge.color, fontWeight: 700 }}>{kycBadge.badge}</span>
          <span style={{ color: "#5a6a8a", fontSize: "0.82rem" }}>{t("booking.kycVerifiedScoreBar", { score: kycScore })}</span>
          <span className={styles.kycRef}>{t("booking.futureRefLabel")}<strong>{bookingRef}</strong></span>
        </div>

        {/* ── Progress steps ──────────────────────────── */}
        <div className={styles.stepIndicator}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`${styles.stepBtn} ${step === s.id ? styles.stepActive : ""} ${step > s.id ? styles.stepDone : ""}`}
            >
              {step > s.id ? "✓ " : ""}{t(s.label)}
            </div>
          ))}
        </div>

        {/* ════ ÉTAPE 1 — DATES & PRISE EN CHARGE ════════ */}
        {step === 1 && (
          <div className={styles.section}>
            {/* Infos client */}
            <h3 className={styles.sectionTitle}>{t("booking.step1ContactTitle")}</h3>
            <div className={styles.row}>
              <input className={styles.input} type="text"  placeholder={t("booking.firstNamePlaceholder")} value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <input className={styles.input} type="text"  placeholder={t("booking.lastNamePlaceholder")} value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className={styles.row}>
              <input className={styles.input} type="email" placeholder={t("booking.emailPlaceholder")} value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className={styles.input} type="tel"   placeholder={t("booking.phonePlaceholder")} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            {showDocumentStep && (
              <p className={styles.optionsNote} style={{ marginTop: -8, marginBottom: 12 }}>
                {t("booking.documentsLaterNote")}
              </p>
            )}

            {/* Essai / Leasing / Location */}
            {isLeasing ? (
              <>
                <h3 className={styles.sectionTitle}>{t("booking.leasingConditionsTitle")}</h3>
                <p className={styles.optionsNote} style={{ marginBottom: 12 }}>
                  {t("booking.leasingConditionsNote")}
                </p>
                <div className={styles.confirmRows}>
                  <div className={styles.confirmRow}><span>{t("booking.downPaymentLabel")}</span><strong>{fmt(financingTerms?.apportInitial || 0)}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.monthlyPaymentLabel")}</span><strong>{fmt(financingTerms?.mensualite || 0)} / {t("booking.monthLabel")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.durationLabel")}</span><strong>{financingTerms?.duree || 36} {t("booking.durationMonthsSuffix")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.interestRateLabel")}</span><strong>{financingTerms?.tauxInteret || 8}% / {t("booking.yearLabel")}</strong></div>
                  {financingTerms?.description && (
                    <div className={styles.confirmRow}><span>{t("booking.financingConditionsLabel")}</span><strong>{financingTerms.description}</strong></div>
                  )}
                </div>
                <label className={styles.optionCard} style={{ marginTop: 16, cursor: "pointer" }}>
                  <input type="checkbox" className={styles.optionCheckbox}
                    checked={leasingAccepted}
                    onChange={(e) => setLeasingAccepted(e.target.checked)} />
                  <span>{t("booking.leasingAcceptCheckboxLabel")}</span>
                </label>
              </>
            ) : isTrial ? (
              <>
                <h3 className={styles.sectionTitle}>{t("booking.trialDateTitle")}</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  {t("booking.trialDateNote")}
                </p>
                <div className={styles.row}>
                  <label className={styles.label}>
                    {t("booking.preferredDateLabel")}
                    <input className={styles.input} type="date" value={form.preferredDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} required />
                  </label>
                  <label className={styles.label}>
                    {t("booking.preferredTimeLabel")}
                    <input className={styles.input} type="time" value={form.preferredTime}
                      onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} required />
                  </label>
                </div>
                {essaiConflict && (
                  <div className={styles.blockedNotice}>
                    {t("booking.trialSlotConflict", { date: new Date(essaiConflict.date).toLocaleString("fr-FR") })}
                  </div>
                )}
                <textarea className={styles.textarea} placeholder={t("booking.notesPlaceholder")}
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </>
            ) : (
              <>
                <h3 className={styles.sectionTitle}>{t("booking.rentalDatesTitle")}</h3>
                {blockedDays.length > 0 && (
                  <div className={styles.blockedNotice}>
                    {t("booking.blockedDaysNotice", { n: blockedDays.length })}
                  </div>
                )}
                <div className={styles.row}>
                  <label className={styles.label}>
                    {t("booking.startDateLabel")}
                    <input className={`${styles.input} ${form.startDate && blockedSet.has(form.startDate) ? styles.inputBlocked : ""}`}
                      type="date" value={form.startDate} min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                    {form.startDate && blockedSet.has(form.startDate) && <span className={styles.blockedMsg}>{t("booking.dateBlockedMsg")}</span>}
                  </label>
                  <label className={styles.label}>
                    {t("booking.endDateLabel")}
                    <input className={`${styles.input} ${form.endDate && blockedSet.has(form.endDate) ? styles.inputBlocked : ""}`}
                      type="date" value={form.endDate} min={form.startDate || new Date().toISOString().split("T")[0]}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                    {form.endDate && blockedSet.has(form.endDate) && <span className={styles.blockedMsg}>{t("booking.dateBlockedMsg")}</span>}
                  </label>
                </div>
                {days > 0 && <p className={styles.daysLabel}>{t("booking.daysCountLabel", { n: days })}</p>}
                {days > 0 && days < (vehicle?.dureeMinLocation || 1) && (
                  <p className={styles.errorMsg}>{t("booking.minDurationError", { n: vehicle.dureeMinLocation })}</p>
                )}

                {/* Mode prise en charge */}
                <h3 className={styles.sectionTitle}>{t("booking.pickupModeTitle")}</h3>
                <div className={styles.pickupCards}>
                  <div
                    className={`${styles.pickupCard} ${pickupMethod === "retrait" ? styles.pickupCardActive : ""}`}
                    onClick={() => setPickupMethod("retrait")}
                  >
                    <span>🏢</span>
                    <div>
                      <strong>{t("booking.pickupAgencyLabel")}</strong>
                      <span>{t("booking.pickupAgencyFreeDesc", { address: agencyFull || t("booking.addressAfterConfirmation") })}</span>
                    </div>
                    <div className={styles.radioIndicator}>{pickupMethod === "retrait" ? "●" : "○"}</div>
                  </div>
                  <div
                    className={`${styles.pickupCard} ${pickupMethod === "livraison" ? styles.pickupCardActive : ""}`}
                    onClick={() => setPickupMethod("livraison")}
                  >
                    <span>🚚</span>
                    <div>
                      <strong>{t("booking.pickupDeliveryLabel")}</strong>
                      <span>{t("booking.pickupDeliveryDesc")}</span>
                    </div>
                    <div className={styles.radioIndicator}>{pickupMethod === "livraison" ? "●" : "○"}</div>
                  </div>
                </div>

                {pickupMethod === "livraison" && (
                  <div className={styles.deliveryBlock}>
                    <div className={styles.deliveryModeRow}>
                      <button
                        type="button"
                        className={`${styles.gpsBtn} ${gpsState === "ok" ? styles.gpsBtnOk : ""}`}
                        onClick={handleDetectGPS}
                        disabled={gpsState === "loading"}
                      >
                        {gpsState === "loading" ? t("booking.gpsDetecting") : gpsState === "ok" ? t("booking.gpsDetected") : t("booking.gpsUseMyPosition")}
                      </button>
                      <button type="button" className={styles.gpsBtn} onClick={() => setShowMapPicker(true)}>
                        {t("booking.chooseOnMap")}
                      </button>
                    </div>
                    {gpsError && <p className={styles.errorMsg}>⚠️ {gpsError}</p>}
                    <input
                      type="text"
                      className={styles.input}
                      placeholder={t("booking.deliveryAddressPlaceholder")}
                      value={pickupAddress}
                      onChange={(e) => { setPickupAddress(e.target.value); if (!e.target.value) { setPickupPosition(null); setGeoDistance(null); setGeoFee(null); } }}
                    />
                    <div className={styles.deliveryFieldsRow}>
                      <input
                        type="text" className={styles.input} placeholder={t("booking.cityPlaceholder")}
                        value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)}
                      />
                      <input
                        type="text" className={styles.input} placeholder={t("booking.postalCodePlaceholder")}
                        value={deliveryPostalCode} onChange={(e) => setDeliveryPostalCode(e.target.value)}
                      />
                    </div>
                    <input
                      type="text" className={styles.input} placeholder={t("booking.deliveryInstructionsPlaceholder")}
                      value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)}
                    />
                    {showMapPicker && (
                      <DeliveryMapPicker
                        initialPosition={pickupPosition}
                        fallbackCenter={vehicle?.coordonnees}
                        onConfirm={handleMapConfirm}
                        onClose={() => setShowMapPicker(false)}
                      />
                    )}
                    {pickupMethod === "livraison" && (
                      <div className={styles.deliveryFeeBox}>
                        <div className={styles.deliveryFeeRow}>
                          <span>{t("booking.deliveryFeeLabel")}</span>
                          {geoFeeLoading ? <span>{t("booking.calculating")}</span>
                            : geoFee != null ? <strong className={styles.feeAmount}>{fmt(deliveryFee)}</strong>
                            : <span className={styles.feePending}>{t("booking.enableGpsToCalculate")}</span>}
                        </div>
                        {geoDistance && <p className={styles.distanceLabel}>{t("booking.estimatedDistance", { km: geoDistance })}</p>}
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
                      {/* Règle appliquée site large : l'appel ne pointe jamais vers le
                          partenaire ni n'affiche son numéro, uniquement le service
                          client VIT AUTO dédié au pays de l'annonce. */}
                      <a href={`tel:${getCustomerServiceContact(vehicle?.country).tel}`} className={styles.agencyPhone}>
                        {t("booking.callCustomerService")}
                      </a>
                    </div>
                    <div className={styles.freeBadge}>{t("booking.freeLabel")}</div>
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
                  (!isTrial && !isLeasing && (!form.startDate || !form.endDate || days <= 0 || days < (vehicle?.dureeMinLocation || 1))) ||
                  (isTrial && (!form.preferredDate || !form.preferredTime || !!essaiConflict)) ||
                  (!isLeasing && pickupMethod === "livraison" && !pickupAddress.trim())
                }
              >
                {t("booking.next")}
              </button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 2 — OPTIONS ════════════════════════ */}
        {step === 2 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("booking.optionsTitle")}</h3>
            <p className={styles.optionsNote}>{t("booking.optionsRateNote", { n: Math.max(days, 1) })}</p>

            <div className={styles.optionsGrid}>
              {OPTIONS_CATALOG.map((opt) => (
                <label key={opt.id} className={`${styles.optionCard} ${selectedOptions[opt.id] ? styles.optionCardActive : ""}`}>
                  <input type="checkbox" className={styles.optionCheckbox}
                    checked={selectedOptions[opt.id]}
                    onChange={(e) => setSelectedOptions({ ...selectedOptions, [opt.id]: e.target.checked })} />
                  <span className={styles.optionIcon}>{opt.icon}</span>
                  <div className={styles.optionInfo}>
                    <strong>{t(opt.label)}</strong>
                    <span>{t("booking.optionPricePerDay", { price: fmt(opt.price) })}</span>
                  </div>
                  {selectedOptions[opt.id] && <span className={styles.optionCheck}>✓</span>}
                </label>
              ))}
            </div>

            {optionsTotal > 0 && (
              <div className={styles.optionsTotalBar}>
                {t("booking.optionsSelectedTotal")}<strong>{fmt(optionsTotal)}</strong>
              </div>
            )}

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(1)}>{t("booking.back")}</button>
              <button className={styles.primaryBtn} onClick={() => setStep(3)}>{t("booking.next")}</button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 3 — PAIEMENT ═══════════════════════ */}
        {step === 3 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("booking.paymentMethodTitle")}</h3>

            {/* Location (hors essai/leasing) : un seul moyen possible (espèces)
                — pas de grille de sélection pour un choix unique, on va droit
                au bloc d'information. */}
            {!isRentalOnly && (
              <div className={styles.payMethodGrid}>
                {visiblePaymentMethods.map((pm) => (
                  <label key={pm.value} className={`${styles.payCard} ${payMethod === pm.value ? styles.payCardActive : ""}`}>
                    <input type="radio" name="payMethod" value={pm.value}
                      checked={payMethod === pm.value} onChange={() => setPayMethod(pm.value)} />
                    <span className={styles.payIcon}>{pm.icon}</span>
                    <span className={styles.payLabel}>{pm.translate ? t(pm.label) : pm.label}</span>
                  </label>
                ))}
              </div>
            )}

            {!isRentalOnly && ["orange_money", "wave", "mtn", "moov"].includes(payMethod) && (
              <div className={styles.payDetails}>
                <label className={styles.label}>
                  {t("booking.mobileNumberLabel")}
                  <input className={styles.input} type="tel" placeholder="+225 07 00 00 00 00"
                    value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} required />
                </label>
              </div>
            )}

            {payMethod === "cash" && (
              <div className={styles.payDetails}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem", color: "#1e3a8a" }}>
                  {t("booking.cashPaymentNote")}
                </div>
              </div>
            )}

            {payMethod === "card" && (
              <div className={styles.payDetails}>
                <div className={styles.row}>
                  <label className={styles.label}>
                    {t("booking.cardNumberLabel")}
                    <input className={styles.input} type="text" placeholder={t("booking.cardNumberPlaceholder")}
                      value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} maxLength={19} />
                  </label>
                  <label className={styles.label}>
                    {t("booking.cardHolderLabel")}
                    <input className={styles.input} type="text" placeholder={t("booking.cardHolderPlaceholder")}
                      value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} />
                  </label>
                </div>
                <div className={styles.row}>
                  <label className={styles.label}>
                    {t("booking.cardExpiryLabel")}
                    <input className={styles.input} type="text" placeholder={t("booking.cardExpiryPlaceholder")}
                      value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} maxLength={5} />
                  </label>
                  <label className={styles.label}>
                    {t("booking.cardCvvLabel")}
                    <input className={styles.input} type="text" placeholder="123"
                      value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} maxLength={4} />
                  </label>
                </div>
              </div>
            )}

            {!isRentalOnly && (
              <>
                <div className={styles.securityNote}>
                  {t("booking.securePaymentNote")}
                </div>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: "0.8rem", color: "#92400e", marginTop: 8 }}>
                  {t("booking.simulationModeNote")}
                </div>
              </>
            )}

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(isLeasing ? 1 : 2)}>{t("booking.back")}</button>
              <button
                className={styles.primaryBtn}
                onClick={() => setStep(4)}
                disabled={
                  (["orange_money","wave","mtn","moov"].includes(payMethod) && !mobileNumber) ||
                  (payMethod === "card" && (!cardNumber || !cardHolder || !cardExpiry || !cardCvv))
                }
              >
                {t("booking.viewSummary")}
              </button>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 4 — CONFIRMATION ═══════════════════ */}
        {step === 4 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("booking.summaryTitle")}</h3>

            <div className={styles.refBox}>
              <span>{t("booking.referenceLabel")}</span>
              <strong className={styles.refCode}>{bookingRef}</strong>
            </div>

            <div className={styles.confirmRows}>
              <div className={styles.confirmRow}><span>{t("booking.clientLabel")}</span><strong>{form.firstName} {form.lastName}</strong></div>
              <div className={styles.confirmRow}><span>{t("booking.emailLabel")}</span><strong>{form.email}</strong></div>
              <div className={styles.confirmRow}><span>{t("booking.phoneLabel")}</span><strong>{form.phone}</strong></div>
              <div className={styles.confirmRow}><span>{t("booking.vehicleLabel")}</span><strong>{vehicle.title || vehicle.name}</strong></div>
              {!isTrial && !isLeasing && (
                <>
                  <div className={styles.confirmRow}><span>{t("booking.fromLabel")}</span><strong>{new Date(form.startDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.toLabel")}</span><strong>{new Date(form.endDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.durationLabel")}</span><strong>{t("booking.daysCountLabel", { n: days })}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.pickupLabel")}</span><strong>{pickupMethod === "retrait" ? t("booking.pickupSummaryAgency", { agency: agencyFull || t("booking.agencyFallback") }) : t("booking.pickupSummaryDelivery", { address: pickupAddress.slice(0, 50) })}</strong></div>
                  {baseTotal > 0 && <div className={styles.confirmRow}><span>{t("booking.baseAmountLabel")}</span><strong>{fmt(baseTotal)}</strong></div>}
                  {promoActive && (
                    <div className={styles.confirmRow} style={{ color: "#dc2626" }}>
                      <span>{t("booking.promotionLabel", { label: activePromo.label ? ` (${activePromo.label})` : "" })}</span>
                      <strong>{activePromo.type === "percent" ? `-${activePromo.value}%` : `-${fmt(activePromo.value)}`}</strong>
                    </div>
                  )}
                  {optionsTotal > 0 && <div className={styles.confirmRow}><span>{t("booking.optionsLabel")}</span><strong>{fmt(optionsTotal)}</strong></div>}
                  {pickupMethod === "livraison" && <div className={styles.confirmRow}><span>{t("booking.deliveryLabel")}</span><strong>{fmt(deliveryFee)}</strong></div>}
                </>
              )}
              {isTrial && (
                <>
                  <div className={styles.confirmRow}><span>{t("booking.trialDateSummaryLabel")}</span><strong>{new Date(form.preferredDate).toLocaleDateString("fr-FR")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.timeLabel")}</span><strong>{form.preferredTime}</strong></div>
                </>
              )}
              {isLeasing && (
                <>
                  <div className={styles.confirmRow}><span>{t("booking.downPaymentLabel")}</span><strong>{fmt(baseTotal)}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.monthlyPaymentLabel")}</span><strong>{fmt(financingTerms?.mensualite || 0)} / {t("booking.durationMonthsSuffix")}</strong></div>
                  <div className={styles.confirmRow}><span>{t("booking.durationLabel")}</span><strong>{financingTerms?.duree || 36} {t("booking.durationMonthsSuffix")}</strong></div>
                </>
              )}
              {!isTrial && !isLeasing && maxPointsUsable > 0 && (
                <div className={styles.confirmRow}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={applyPoints} onChange={(e) => setApplyPoints(e.target.checked)} />
                    {t("booking.useLoyaltyPoints", { n: user.loyaltyPoints })}
                  </label>
                  {applyPoints && <strong style={{ color: "#059669" }}>-{fmt(loyaltyDiscountPreview)}</strong>}
                </div>
              )}
              <div className={styles.confirmRow}><span>{t("booking.serviceFeeLabel")}</span><strong>{fmt(SERVICE_FEE)}</strong></div>
              <div className={styles.confirmRow}><span>{t("booking.paymentLabel")}</span><strong>{(() => { const pm = PAYMENT_METHODS.find((p) => p.value === payMethod); return pm ? (pm.translate ? t(pm.label) : pm.label) : payMethod; })()}</strong></div>
              <div className={`${styles.confirmRow} ${styles.confirmTotal}`}>
                <span>{t("booking.totalToPayLabel")}</span>
                <strong><PriceTag amountUSD={totalToPay} /></strong>
              </div>
            </div>

            {/* ── Documents liés à LA RÉSERVATION (restructuration 2026-09) ──
                Demandés ici, en dernière étape, pour conclure la réservation —
                jamais avant. Transmis au partenaire + conservés pour l'admin
                en cas de litige (voir bookingController.createBooking). Pas
                d'OCR ni de revue manuelle : juste l'image. ────────────────── */}
            {showDocumentStep && (
              <div style={{ margin: "18px 0" }}>
                <h3 className={styles.sectionTitle}>{t("booking.documentsTitle")}</h3>
                <p className={styles.optionsNote}>{t("booking.documentsIntro")}</p>

                {kycStatus === "VERIFIE" ? (
                  <div className={styles.kycBadgeBar} style={{ background: kycBadge.bg, borderColor: kycBadge.border }}>
                    {kycBadge.emoji} <span style={{ color: kycBadge.color, fontWeight: 700 }}>{kycBadge.badge}</span>
                    <span style={{ color: "#5a6a8a", fontSize: "0.82rem" }}>{t("booking.identityVerifiedSuffix")}</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.row}>
                      <label className={styles.label} style={{ flex: 1 }}>
                        {t("booking.idTypeLabel")}
                        <select className={styles.input} value={idType} onChange={(e) => setIdType(e.target.value)}>
                          <option value="cni">{t("booking.idTypeCni")}</option>
                          <option value="passport">{t("booking.idTypePassport")}</option>
                          <option value="carte_sejour">{t("booking.idTypeResidence")}</option>
                        </select>
                      </label>
                    </div>
                    <div className={styles.row}>
                      <label style={{ flex: 1, cursor: "pointer", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: 14, textAlign: "center", fontSize: "0.85rem" }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                          onChange={(e) => readImageFile(e.target.files?.[0], setIdFrontImage)} />
                        {idFrontImage
                          ? <img src={idFrontImage} alt="" style={{ maxHeight: 90, borderRadius: 8 }} />
                          : <span>📄 {t("booking.uploadIdFront")}</span>}
                      </label>
                      <label style={{ flex: 1, cursor: "pointer", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: 14, textAlign: "center", fontSize: "0.85rem" }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                          onChange={(e) => readImageFile(e.target.files?.[0], setIdBackImage)} />
                        {idBackImage
                          ? <img src={idBackImage} alt="" style={{ maxHeight: 90, borderRadius: 8 }} />
                          : <span>📄 {t("booking.uploadIdBackOptional")}</span>}
                      </label>
                    </div>
                  </>
                )}

                {needsLicenseDoc && !hasVerifiedLicense && (
                  <>
                    <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>{t("booking.licenseDocTitle")}</h3>
                    <div className={styles.row}>
                      <label style={{ flex: 1, cursor: "pointer", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: 14, textAlign: "center", fontSize: "0.85rem" }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                          onChange={(e) => readImageFile(e.target.files?.[0], setLicenseFrontImage)} />
                        {licenseFrontImage
                          ? <img src={licenseFrontImage} alt="" style={{ maxHeight: 90, borderRadius: 8 }} />
                          : <span>🪪 {t("booking.uploadLicenseFront")}</span>}
                      </label>
                      <label style={{ flex: 1, cursor: "pointer", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: 14, textAlign: "center", fontSize: "0.85rem" }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                          onChange={(e) => readImageFile(e.target.files?.[0], setLicenseBackImage)} />
                        {licenseBackImage
                          ? <img src={licenseBackImage} alt="" style={{ maxHeight: 90, borderRadius: 8 }} />
                          : <span>🪪 {t("booking.uploadLicenseBackOptional")}</span>}
                      </label>
                    </div>
                  </>
                )}

                {docError && <p className={styles.errorMsg}>⚠️ {docError}</p>}
                <p className={styles.optionsNote}>{t("booking.documentsPrivacyNote")}</p>
              </div>
            )}

            <div className={styles.legalNote}>
              {t("booking.legalAcceptPrefix")}
              <Link to="/cgu" target="_blank">{t("booking.termsLink")}</Link>
              {t("booking.legalAcceptConnector")}
              <Link to="/privacy" target="_blank">{t("booking.privacyLink")}</Link>{t("booking.legalAcceptSuffix")}
            </div>

            {!documentsReady && (
              <p className={styles.errorMsg}>{t("booking.documentsMissingNote")}</p>
            )}

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep(3)}>{t("booking.editButton")}</button>
              <button className={styles.confirmBtn} onClick={handleSubmit} disabled={submitting || !documentsReady}>
                {submitting ? t("booking.sending") : t("booking.confirmButton", { total: fmt(totalToPay) })}
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
                <div className={styles.sidebarRow}><span>{t("booking.downPaymentLabel")}</span><strong>{fmt(baseTotal)}</strong></div>
                <div className={styles.sidebarRow}><span>{t("booking.monthlyPaymentLabel")}</span><strong>{fmt(financingTerms?.mensualite || 0)}/{t("booking.durationMonthsSuffix")}</strong></div>
                <div className={styles.sidebarRow}><span>{t("booking.durationLabel")}</span><strong>{financingTerms?.duree || 36} {t("booking.durationMonthsSuffix")}</strong></div>
              </>
            ) : (
              <>
                {!isTrial && <div className={styles.sidebarRow}><span>{t("booking.pricePerDayLabel")}</span><strong><PriceTag amountUSD={vehicle.pricePerDay || 0} enteredAmount={vehicle.pricePerDayEntered} enteredCurrency={vehicle.priceEntryCurrency} /></strong></div>}
                {days > 0 && !isTrial && <div className={styles.sidebarRow}><span>{t("booking.durationLabel")}</span><strong>{t("booking.daysAbbrev", { n: days })}</strong></div>}
                {baseTotal > 0 && !isTrial && <div className={styles.sidebarRow}><span>{t("booking.baseAmountLabel")}</span><strong>{fmt(baseTotal)}</strong></div>}
                {promoActive && !isTrial && (
                  <div className={styles.sidebarRow} style={{ color: "#dc2626" }}>
                    <span>{t("booking.promotionLabel", { label: "" })}</span>
                    <strong>{activePromo.type === "percent" ? `-${activePromo.value}%` : `-${fmt(activePromo.value)}`}</strong>
                  </div>
                )}
                {optionsTotal > 0 && <div className={styles.sidebarRow}><span>{t("booking.optionsLabel")}</span><strong>{fmt(optionsTotal)}</strong></div>}
                {pickupMethod === "livraison" && !isTrial && (
                  <div className={styles.sidebarRow}>
                    <span>{t("booking.deliveryLabel")}{geoDistance ? ` (${geoDistance}km)` : ""}</span>
                    <strong>{geoFeeLoading ? t("booking.loadingEllipsis") : fmt(deliveryFee)}</strong>
                  </div>
                )}
                {pickupMethod === "retrait" && !isTrial && (
                  <div className={styles.sidebarRow}><span>{t("booking.pickupAgencySidebarLabel")}</span><strong className={styles.freeLabel}>{t("booking.freeLabel")}</strong></div>
                )}
              </>
            )}
            <div className={styles.sidebarRow}><span>{t("booking.serviceFeeShortLabel")}</span><strong>{fmt(SERVICE_FEE)}</strong></div>
            <div className={`${styles.sidebarRow} ${styles.sidebarTotal}`}>
              <span>{t("booking.totalLabel")}</span>
              <strong><PriceTag amountUSD={totalToPay} /></strong>
            </div>
          </div>

          <div className={styles.sidebarKyc} style={{ borderColor: kycBadge.border, background: kycBadge.bg }}>
            {kycBadge.emoji} <span style={{ color: kycBadge.color, fontWeight: 700, fontSize: "0.82rem" }}>
              {kycBadge.badge} — {kycScore}/100
            </span>
          </div>

          <div className={styles.sidebarGuarantee}>
            {t("booking.sidebarGuaranteeNote")}
          </div>
        </div>
      </aside>
    </div>
  );
}
