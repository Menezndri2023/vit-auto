import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useLocation as useGeoLocation } from "../context/LocationContext";
import styles from "./Booking.module.css";

const SERVICE_FEE = 1000; // FCFA fixe plateforme

const optionsData = [
  { id: "babySeat",  label: "Siège bébé",        price: 7000  },
  { id: "insurance", label: "Prime d'assurance", price: 15000 },
  { id: "driver",    label: "Chauffeur privé",   price: 50000 },
];

// GPS disponible en option seulement pour le retrait (livraison = GPS inclus)
const gpsOption = { id: "gps", label: "GPS intégré", price: 10000 };

// Zones de livraison à domicile avec frais fixes
const DELIVERY_ZONES = [
  { id: "z1", label: "Même quartier (< 5 km)",   fee: 3000  },
  { id: "z2", label: "Même ville (5 – 15 km)",   fee: 5000  },
  { id: "z3", label: "Banlieue (15 – 30 km)",    fee: 7500  },
  { id: "z4", label: "Interurbain (> 30 km)",    fee: 10000 },
];

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

const Booking = () => {
  const { id }      = useParams();
  const [searchParams] = useSearchParams();
  const navigate    = useNavigate();
  const vehicles    = useVehicles();
  const getVehicleById = vehicles.getItemById ||
    ((id) => vehicles.vehicles?.find(v => String(v.id) === String(id) || v._id === String(id)));
  const addBooking  = vehicles.addBooking;
  const { token, user } = useAuth();
  const { position, address: geoAddress, refreshLocation, error: geoContextError } = useGeoLocation();
  const vehicle = getVehicleById(id);

  // Détecter si leasing demandé via query param ?type=leasing
  const isLeasingRequest = searchParams.get("type") === "leasing";

  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]     = useState(null);
  const geoWaiting = useRef(false);
  const [step, setStep]       = useState(1); // 1=Info, 2=Vérification, 3=Paiement

  useEffect(() => {
    setLoading(true);
    if (!id) { setError("ID véhicule manquant."); setLoading(false); return; }
    if (!getVehicleById(id)) setError("Véhicule non trouvé. Retournez au catalogue.");
    setLoading(false);
  }, [id, getVehicleById]); // eslint-disable-line react-hooks/exhaustive-deps

  // isTrial : mode achat/essai (pas location)
  // isLeasing : mode leasing
  const isSaleMode = vehicle?.mode === "Acheter";
  const isTrial    = isSaleMode && !isLeasingRequest;
  const isLeasing  = isSaleMode && isLeasingRequest && vehicle?.leasing?.disponible;

  // ── Pickup : méthode de prise en charge ───────────────────
  // pickupMethod: "livraison" (vendor vient) | "retrait" (client passe)
  // addressMode: "gps" | "text"
  const [pickupMethod, setPickupMethod]     = useState("livraison");
  const [addressMode,  setAddressMode]      = useState("gps");
  const [pickupAddress, setPickupAddress]   = useState("");
  const [pickupPosition, setPickupPosition] = useState(null);
  const [deliveryZone, setDeliveryZone]     = useState("z1"); // zone de livraison par défaut

  // Quand la position change dans le contexte, mettre à jour l'adresse si on attendait le GPS
  useEffect(() => {
    if (position && addressMode === "gps" && pickupMethod === "livraison") {
      const addr = geoAddress || `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
      setPickupAddress(addr);
      setPickupPosition(position);
      if (geoWaiting.current) {
        geoWaiting.current = false;
        setGeoLoading(false);
        setGeoError(null);
      }
    }
  }, [position, geoAddress, addressMode, pickupMethod]);

  // Quand le contexte signale une erreur GPS pendant notre attente
  useEffect(() => {
    if (geoContextError && geoWaiting.current) {
      geoWaiting.current = false;
      setGeoLoading(false);
      setGeoError("GPS indisponible. Entrez votre adresse manuellement.");
      setAddressMode("text");
    }
  }, [geoContextError]);

  const handleDetectGPS = () => {
    setGeoLoading(true);
    setGeoError(null);
    geoWaiting.current = true;
    refreshLocation();
    // Timeout de sécurité : 12 secondes max
    setTimeout(() => {
      if (geoWaiting.current) {
        geoWaiting.current = false;
        setGeoLoading(false);
        setGeoError("Délai dépassé. Entrez votre adresse manuellement.");
        setAddressMode("text");
      }
    }, 12000);
  };

  // ── Formulaires ───────────────────────────────────────────
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
    idType:     "cni",
    idNumber:   "",
    address:    "",
    agreeTerms: false,
  });

  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: "orange",
    cardNumber:    "",
    cardHolder:    "",
    expiryDate:    "",
    cvv:           "",
    mobileNumber:  "",
  });

  const [simulating, setSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);

  const [selectedOptions, setSelectedOptions] = useState({
    gps: false, babySeat: false, insurance: false, driver: false,
  });

  // GPS automatiquement inclus (sans frais) pour la livraison à domicile
  const gpsAutoIncluded = pickupMethod === "livraison";

  if (loading) return (
    <div className={styles.page}><div style={{ textAlign: "center", padding: "4rem" }}>Chargement...</div></div>
  );

  if (error || !vehicle) return (
    <div className={styles.page}>
      <div style={{ textAlign: "center", padding: "2rem", maxWidth: "500px", margin: "0 auto" }}>
        <h2>Erreur</h2>
        <p>{error || "Véhicule non trouvé"}</p>
        <button onClick={() => navigate("/catalogue")} style={{ background: "#007bff", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: "4px", cursor: "pointer", marginTop: "1rem" }}>
          Voir le catalogue
        </button>
      </div>
    </div>
  );

  // ── Calculs financiers ────────────────────────────────────
  const days = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s) || isNaN(e)) return 0;
    const d = Math.ceil((e - s) / 86400000);
    return d > 0 ? d : 0;
  })();

  // GPS gratuit en livraison — on exclut son coût si pickupMethod === "livraison"
  const allOptions = gpsAutoIncluded ? optionsData : [gpsOption, ...optionsData];
  const optionsTotal = Object.entries(selectedOptions).reduce((acc, [key, val]) => {
    if (!val) return acc;
    if (key === "gps" && gpsAutoIncluded) return acc; // GPS offert
    const opt = allOptions.find((o) => o.id === key);
    return acc + (opt?.price || 0) * Math.max(days, 1);
  }, 0);

  // Frais de livraison selon zone (0 si retrait)
  const selectedZone  = DELIVERY_ZONES.find((z) => z.id === deliveryZone) || DELIVERY_ZONES[0];
  const deliveryFee   = pickupMethod === "livraison" ? selectedZone.fee : 0;

  const baseTotal  = (vehicle.pricePerDay || 0) * Math.max(days, 1);
  const totalToPay = isTrial ? SERVICE_FEE : baseTotal + optionsTotal + deliveryFee + SERVICE_FEE;

  // ── Handlers ─────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name in selectedOptions) { setSelectedOptions({ ...selectedOptions, [name]: checked }); return; }
    if (name in form)            { setForm({ ...form, [name]: value }); return; }
    if (name in paymentForm)     { setPaymentForm({ ...paymentForm, [name]: value }); return; }
  };

  const handleVerifChange = (e) => {
    const { name, value, type, checked } = e.target;
    setVerificationForm({ ...verificationForm, [name]: type === "checkbox" ? checked : value });
  };

  const handleTrialChange = (e) => {
    const { name, value } = e.target;
    setTrialForm({ ...trialForm, [name]: value });
  };

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
        if (addressMode === "text") {
          alert("Renseignez votre adresse de livraison."); return;
        }
        // GPS sélectionné mais pas d'adresse → utiliser la zone comme référence
        setPickupAddress(`Livraison — ${selectedZone.label}`);
      }
    }
    setStep(2);
  };

  const handleVerifSubmit = (e) => {
    e.preventDefault();
    if (!verificationForm.idType || !verificationForm.idNumber) {
      alert("Veuillez fournir votre pièce d'identité."); return;
    }
    if (!verificationForm.agreeTerms) {
      alert("Vous devez accepter les conditions générales."); return;
    }
    setStep(3);
  };

  const runSimulatedPayment = () => {
    setSimulating(true);
    setSimProgress(0);
    const steps = [
      { p: 20, delay: 400 },
      { p: 55, delay: 900 },
      { p: 80, delay: 1400 },
      { p: 100, delay: 2000 },
    ];
    steps.forEach(({ p, delay }) => {
      setTimeout(() => setSimProgress(p), delay);
    });
    setTimeout(() => {
      setSimulating(false);
      finishBooking();
    }, 2400);
  };

  const finishBooking = () => {
    const commissionRate   = (isTrial || isLeasing) ? 0.03 : 0.15;
    const leasingData      = vehicle?.leasing || {};
    const leasingApport    = leasingData.apportInitial || 0;
    const leasingMensual   = leasingData.mensualite || 0;
    const leasingDuree     = leasingData.duree || 36;
    const leasingTotal     = leasingApport + leasingMensual * leasingDuree;
    const commissionAmount = Math.round((isLeasing ? leasingApport : baseTotal) * commissionRate);
    const partnerPayout    = Math.max((isLeasing ? leasingApport : baseTotal) - commissionAmount - SERVICE_FEE, 0);
    const finalPickup = pickupMethod === "retrait"
      ? `Retrait chez le vendeur (${vehicle.pickupAddress || "adresse communiquée par le vendeur"})`
      : pickupAddress;

    const booking = isLeasing
      ? { id: Date.now(), userId: user?.id, vehicleId: vehicle._id || vehicle.id, vehicleName: vehicle.name, vehicleMode: vehicle.mode, ...trialForm, type: "leasing", status: "À confirmer", createdAt: new Date().toISOString(), serviceFeeFCFA: SERVICE_FEE, commissionRate, commissionAmount, partnerPayout, leasingInfo: { apportInitial: leasingApport, mensualite: leasingMensual, duree: leasingDuree, totalLeasing: leasingTotal, tauxInteret: leasingData.tauxInteret || 8 }, total: leasingApport, paymentInfo: paymentForm, clientVerification: verificationForm }
      : isTrial
      ? { id: Date.now(), userId: user?.id, vehicleId: vehicle._id || vehicle.id, vehicleName: vehicle.name, vehicleMode: vehicle.mode, ...trialForm, type: "essai", status: "À confirmer", createdAt: new Date().toISOString(), serviceFeeFCFA: SERVICE_FEE, commissionRate, commissionAmount, paymentInfo: paymentForm, clientVerification: verificationForm }
      : { id: Date.now(), userId: user?.id, vehicleId: vehicle._id || vehicle.id, vehicleName: vehicle.name, vehicleMode: vehicle.mode, vehicleType: vehicle.type, pricePerDay: vehicle.pricePerDay, ...form, pickupMethod, pickupAddress: finalPickup, pickupPosition, deliveryZone: pickupMethod === "livraison" ? selectedZone.id : null, deliveryZoneLabel: pickupMethod === "livraison" ? selectedZone.label : null, deliveryFee, selectedOptions, days, optionsTotal, baseTotal, serviceFeeFCFA: SERVICE_FEE, total: totalToPay, createdAt: new Date().toISOString(), commissionRate, commissionAmount, partnerPayout, paidWith: paymentForm.paymentMethod, paymentInfo: paymentForm, clientVerification: verificationForm, type: "location", status: "À confirmer" };

    addBooking(booking);

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const clientInfo = { firstName: isTrial || isLeasing ? trialForm.firstName : form.firstName, lastName: isTrial || isLeasing ? trialForm.lastName : form.lastName, email: isTrial || isLeasing ? trialForm.email : form.email, phone: isTrial || isLeasing ? trialForm.phone : form.phone };
      const apiPayload = isLeasing
        ? { type: "leasing", clientInfo, vehicleId: vehicle._id || vehicle.id, leasing: { apportInitial: leasingApport, mensualite: leasingMensual, duree: leasingDuree, totalLeasing: leasingTotal, tauxInteret: vehicle?.leasing?.tauxInteret || 8 }, clientVerification: verificationForm }
        : isTrial
        ? { type: "essai", clientInfo, vehicleId: vehicle._id || vehicle.id, essai: { preferredDate: trialForm.preferredDate, preferredTime: trialForm.preferredTime, notes: trialForm.notes || "" }, clientVerification: verificationForm }
        : { type: "location", clientInfo, vehicleId: vehicle._id || vehicle.id, location: { startDate: form.startDate, endDate: form.endDate, days, pickupLocation: finalPickup, pickupPosition, returnLocation: "", options: selectedOptions }, clientVerification: verificationForm, payment: { method: paymentForm.paymentMethod, mobileNumber: paymentForm.mobileNumber || undefined, cardNumber: paymentForm.cardNumber || undefined, cardHolder: paymentForm.cardHolder || undefined } };
      fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(apiPayload) }).catch(() => {});
    } catch { /* offline */ }

    navigate("/booking/success", { state: { booking, trial: isTrial || isLeasing, payment: paymentForm } });
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();

    if (paymentForm.paymentMethod === "test") {
      runSimulatedPayment();
      return;
    }

    if (paymentForm.paymentMethod === "card") {
      const req = ["cardNumber", "cardHolder", "expiryDate", "cvv"];
      if (req.find((f) => !paymentForm[f])) { alert("Renseignez les informations de carte."); return; }
    }
    if (["orange", "wave", "mtn", "moov"].includes(paymentForm.paymentMethod) && !paymentForm.mobileNumber) {
      alert("Indiquez votre numéro mobile."); return;
    }

    finishBooking();
  };

  const paymentOptions = [
    { value: "orange", label: "Orange Money" },
    { value: "wave",   label: "Wave" },
    { value: "mtn",    label: "MTN Mobile Money" },
    { value: "moov",   label: "Moov Money" },
    { value: "card",   label: "Carte bancaire" },
    { value: "paypal", label: "PayPal" },
    { value: "cash",   label: "💵 Espèces à la livraison" },
    { value: "test",   label: "🧪 Paiement de test (simulation)" },
  ];

  const stepLabels = ["1. Réservation", "2. Vérification", "3. Paiement"];

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1>{isTrial ? "Demander un essai" : "Réservez votre véhicule"}</h1>

        {/* ── Steps ────────────────────────────── */}
        <div className={styles.stepIndicator}>
          {stepLabels.map((label, i) => (
            <button key={i} type="button"
              className={`${styles.stepBtn} ${step === i + 1 ? styles.stepActive : ""} ${step > i + 1 ? styles.stepDone : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════ */}
        {/* ÉTAPE 1 — Infos + prise en charge      */}
        {/* ══════════════════════════════════════ */}
        {step === 1 && (
          <form onSubmit={handleStepOneSubmit} className={styles.form}>
            {/* Coordonnées client */}
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
                <input type="tel"   name="phone" placeholder="Téléphone *" required
                  value={isTrial ? trialForm.phone : form.phone}
                  onChange={isTrial ? handleTrialChange : handleChange} />
              </div>
            </div>

            {/* Section spécifique essai */}
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
                <div className={styles.section}>
                  <h3>Dates de location</h3>
                  <div className={styles.row}>
                    <label>Date de début <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required /></label>
                    <label>Date de fin   <input type="date" name="endDate"   value={form.endDate}   onChange={handleChange} required /></label>
                  </div>
                </div>

                {/* ── Prise en charge ──────────────────── */}
                <div className={styles.section}>
                  <h3>Prise en charge</h3>

                  {/* Choix livraison / retrait */}
                  <div className={styles.pickupCards}>
                    <div
                      className={`${styles.pickupCard} ${pickupMethod === "livraison" ? styles.pickupCardActive : ""}`}
                      onClick={() => setPickupMethod("livraison")}
                    >
                      <span className={styles.pickupIcon}>🏠</span>
                      <div>
                        <strong>Livraison à domicile</strong>
                        <span>Le vendeur vient vous déposer le véhicule</span>
                      </div>
                      <div className={styles.pickupRadio}>{pickupMethod === "livraison" ? "●" : "○"}</div>
                    </div>
                    <div
                      className={`${styles.pickupCard} ${pickupMethod === "retrait" ? styles.pickupCardActive : ""}`}
                      onClick={() => setPickupMethod("retrait")}
                    >
                      <span className={styles.pickupIcon}>🏢</span>
                      <div>
                        <strong>Retrait en agence</strong>
                        <span>Je me déplace récupérer le véhicule</span>
                      </div>
                      <div className={styles.pickupRadio}>{pickupMethod === "retrait" ? "●" : "○"}</div>
                    </div>
                  </div>

                  {/* Si livraison → saisir adresse */}
                  {pickupMethod === "livraison" && (
                    <div className={styles.addressBlock}>
                      <p className={styles.addressLabel}>Votre adresse de livraison</p>

                      {/* Mode GPS / texte */}
                      <div className={styles.addressModeTabs}>
                        <button
                          type="button"
                          className={`${styles.addressModeTab} ${addressMode === "gps" ? styles.addressModeTabActive : ""}`}
                          onClick={() => setAddressMode("gps")}
                        >
                          🎯 Par GPS
                        </button>
                        <button
                          type="button"
                          className={`${styles.addressModeTab} ${addressMode === "text" ? styles.addressModeTabActive : ""}`}
                          onClick={() => { setAddressMode("text"); setPickupAddress(""); }}
                        >
                          ✏️ Par adresse
                        </button>
                      </div>

                      {addressMode === "gps" ? (
                        <div className={styles.gpsBlock}>
                          {/* Erreur GPS */}
                          {geoError && (
                            <div className={styles.gpsError}>
                              <span>⚠️</span>
                              <span>{geoError}</span>
                            </div>
                          )}

                          {/* Chargement GPS */}
                          {geoLoading && (
                            <div className={styles.gpsLoading}>
                              <span className={styles.gpsSpinner} />
                              <span>Détection de votre position…</span>
                            </div>
                          )}

                          {/* Position détectée */}
                          {!geoLoading && position && pickupAddress && (
                            <div className={styles.gpsDetected}>
                              <span>📍</span>
                              <div>
                                <strong>Position détectée</strong>
                                <p>{pickupAddress}</p>
                              </div>
                              <button type="button" className={styles.gpsRefreshBtn} onClick={handleDetectGPS}>
                                ↻ Actualiser
                              </button>
                            </div>
                          )}

                          {/* Bouton détecter (pas encore fait) */}
                          {!geoLoading && !position && !geoError && (
                            <button type="button" className={styles.gpsDetectBtn} onClick={handleDetectGPS}>
                              🎯 Détecter ma position GPS
                            </button>
                          )}

                          {/* Champ éditable sous la position détectée */}
                          {!geoLoading && pickupAddress && (
                            <input
                              type="text"
                              className={styles.addressInput}
                              value={pickupAddress}
                              onChange={(e) => setPickupAddress(e.target.value)}
                              placeholder="Vous pouvez préciser l'adresse"
                            />
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className={styles.addressInput}
                          placeholder="Ex: Cocody, Avenue de la Paix, Abidjan"
                          value={pickupAddress}
                          onChange={(e) => setPickupAddress(e.target.value)}
                        />
                      )}
                    </div>
                  )}

                  {pickupMethod === "retrait" && (
                    <div className={styles.retraitInfo}>
                      <span>📋</span>
                      <p>L'adresse exacte du point de retrait vous sera communiquée par le vendeur après confirmation de votre réservation.</p>
                    </div>
                  )}

                  {/* ── Frais de livraison selon distance ── */}
                  {pickupMethod === "livraison" && (
                    <div className={styles.deliveryZones}>
                      <span className={styles.deliveryZoneLabel}>🚚 Distance de livraison</span>
                      {DELIVERY_ZONES.map((zone) => (
                        <label
                          key={zone.id}
                          className={`${styles.zoneRow} ${deliveryZone === zone.id ? styles.zoneRowActive : ""}`}
                        >
                          <div className={styles.zoneLeft}>
                            <input
                              type="radio"
                              name="deliveryZone"
                              value={zone.id}
                              checked={deliveryZone === zone.id}
                              onChange={() => setDeliveryZone(zone.id)}
                            />
                            <span>{zone.label}</span>
                          </div>
                          <span className={styles.zoneFee}>
                            {zone.fee.toLocaleString("fr-FR")} FCFA
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Options */}
                <div className={styles.section}>
                  <h3>Options supplémentaires</h3>

                  {/* Badge GPS inclus pour la livraison */}
                  {gpsAutoIncluded && (
                    <div className={styles.gpsDetected} style={{ marginBottom: "10px" }}>
                      <span>📍</span>
                      <div>
                        <strong>GPS de livraison inclus gratuitement</strong>
                        <p>Associé automatiquement à votre adresse de livraison</p>
                      </div>
                    </div>
                  )}

                  <div className={styles.optionsGrid}>
                    {/* GPS affiché en option payante seulement pour le retrait */}
                    {!gpsAutoIncluded && (
                      <label key="gps" className={styles.optionItem}>
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

        {/* ══════════════════════════════════════ */}
        {/* ÉTAPE 2 — Vérification identité        */}
        {/* ══════════════════════════════════════ */}
        {step === 2 && (
          <form onSubmit={handleVerifSubmit} className={styles.form}>
            <div className={styles.section}>
              <h3>Vérification d'identité</h3>
              <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "1rem" }}>
                Requise pour la sécurité de toutes les parties. Données chiffrées et confidentielles.
              </p>
              <div className={styles.row}>
                <label>
                  Type de pièce
                  <select name="idType" value={verificationForm.idType} onChange={handleVerifChange} required>
                    <option value="cni">CNI (Carte nationale)</option>
                    <option value="passport">Passeport</option>
                    <option value="permis">Permis de conduire</option>
                  </select>
                </label>
                <label>
                  Numéro de pièce
                  <input type="text" name="idNumber" placeholder="Ex: CI-0000-000000"
                    value={verificationForm.idNumber} onChange={handleVerifChange} required />
                </label>
              </div>
              <label>
                Adresse de résidence (facultatif)
                <input type="text" name="address" placeholder="Ex: Cocody, Abidjan"
                  value={verificationForm.address} onChange={handleVerifChange} />
              </label>
            </div>

            <div className={styles.section}>
              <label className={styles.checkLabel}>
                <input type="checkbox" name="agreeTerms" checked={verificationForm.agreeTerms} onChange={handleVerifChange} />
                J'accepte les <a href="/plans" target="_blank" rel="noopener noreferrer">conditions générales</a> de VIT AUTO
              </label>
            </div>

            <div className={styles.section} style={{ display: "flex", gap: "1rem" }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setStep(1)}>← Retour</button>
              <button type="submit" className={styles.primaryBtn}>Continuer →</button>
            </div>
          </form>
        )}

        {/* ══════════════════════════════════════ */}
        {/* ÉTAPE 3 — Paiement                     */}
        {/* ══════════════════════════════════════ */}
        {step === 3 && (
          <form onSubmit={handlePaymentSubmit} className={styles.form}>

            {/* ── Overlay simulation paiement ── */}
            {simulating && (
              <div style={{
                position: "fixed", inset: 0, background: "rgba(15,27,63,0.75)",
                zIndex: 999, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "1.5rem",
              }}>
                <div style={{
                  background: "#fff", borderRadius: "20px", padding: "2.5rem 3rem",
                  textAlign: "center", maxWidth: "360px", width: "90%",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                }}>
                  <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🧪</div>
                  <h3 style={{ margin: "0 0 0.5rem", color: "#0f1b3f", fontSize: "1.2rem" }}>Simulation en cours…</h3>
                  <p style={{ color: "#64748b", fontSize: "0.88rem", margin: "0 0 1.5rem" }}>
                    Traitement du paiement de test — aucun débit réel
                  </p>
                  <div style={{ background: "#f1f5f9", borderRadius: "999px", height: "10px", overflow: "hidden", marginBottom: "0.75rem" }}>
                    <div style={{
                      height: "100%", borderRadius: "999px",
                      background: "linear-gradient(90deg, #ff4d2d, #ff7a00)",
                      width: `${simProgress}%`,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "0.78rem", margin: 0 }}>{simProgress}% — {simProgress < 55 ? "Vérification…" : simProgress < 90 ? "Autorisation…" : "Confirmation…"}</p>
                </div>
              </div>
            )}

            {/* ── Bannière mode test ── */}
            {paymentForm.paymentMethod === "test" && !simulating && (
              <div style={{
                background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                border: "1.5px solid #fbbf24",
                borderRadius: "14px", padding: "1rem 1.25rem",
                marginBottom: "0.5rem",
                display: "flex", alignItems: "flex-start", gap: "0.75rem",
              }}>
                <span style={{ fontSize: "1.5rem" }}>🧪</span>
                <div>
                  <strong style={{ color: "#92400e", display: "block", marginBottom: "2px" }}>Mode Test activé</strong>
                  <span style={{ color: "#78350f", fontSize: "0.84rem" }}>
                    Aucun débit réel. Cette simulation valide le parcours complet de réservation.
                    Cliquez sur <em>Confirmer et payer</em> pour déclencher la simulation.
                  </span>
                </div>
              </div>
            )}

            <div className={styles.section}>
              <h3>Méthode de paiement</h3>
              <div className={styles.optionsGrid}>
                {paymentOptions.map((option) => (
                  <label key={option.value} className={`${styles.optionItem} ${paymentForm.paymentMethod === option.value ? styles.optionActive : ""}`}
                    style={option.value === "test" ? { borderColor: "#fbbf24", background: paymentForm.paymentMethod === "test" ? "#fef9ee" : undefined } : {}}>
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
                <h3>Numéro {paymentForm.paymentMethod.toUpperCase()}</h3>
                <input type="tel" name="mobileNumber" value={paymentForm.mobileNumber} onChange={handleChange} placeholder="+225 07 000 00 00" required />
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

      {/* ── Récapitulatif sidebar ─────────────── */}
      <aside className={styles.summaryCard}>
        <h3>Récapitulatif</h3>
        <div className={styles.summaryImage}>
          <img src={vehicle.image} alt={vehicle.name} />
          <span>{vehicle.name}</span>
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
            <div className={styles.summaryItem}><span>Options</span><strong>{fmt(optionsTotal)}</strong></div>
            {pickupMethod === "livraison" && (
              <div className={styles.summaryItem}>
                <span>🚚 Livraison ({selectedZone.label.split("(")[0].trim()})</span>
                <strong>{fmt(deliveryFee)}</strong>
              </div>
            )}
            <div className={styles.summaryItem}><span>Frais de service</span><strong>{fmt(SERVICE_FEE)}</strong></div>
            <div className={styles.summaryTotal}><span>Total TTC</span><strong>{fmt(totalToPay)}</strong></div>
            {/* Prise en charge */}
            {pickupMethod && (
              <div className={styles.pickupSummary}>
                <span>{pickupMethod === "livraison" ? "🏠 Livraison" : "🏢 Retrait agence"}</span>
                {pickupMethod === "livraison" && pickupAddress && (
                  <small>{pickupAddress.length > 50 ? pickupAddress.slice(0, 50) + "…" : pickupAddress}</small>
                )}
              </div>
            )}
          </>
        )}

        <p className={styles.guarantee}>Réservation sécurisée · Contrat digital inclus</p>
      </aside>
    </div>
  );
};

export default Booking;
