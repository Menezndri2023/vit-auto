import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useLocation as useGeoLocation } from "../context/LocationContext";
import styles from "./Booking.module.css";

const SERVICE_FEE = 1000; // FCFA fixe plateforme

const optionsData = [
  { id: "gps",       label: "GPS intégré",      price: 10000 },
  { id: "babySeat",  label: "Siège bébé",        price: 7000  },
  { id: "insurance", label: "Prime d'assurance", price: 15000 },
  { id: "driver",    label: "Chauffeur privé",   price: 50000 },
];

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

const Booking = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const vehicles    = useVehicles();
  const getVehicleById = vehicles.getItemById ||
    ((id) => vehicles.vehicles?.find(v => String(v.id) === String(id) || v._id === String(id)));
  const addBooking  = vehicles.addBooking;
  const { token, user } = useAuth();
  const { position, address: geoAddress, refreshLocation } = useGeoLocation();
  const vehicle = getVehicleById(id);

  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [step, setStep]       = useState(1); // 1=Info, 2=Vérification, 3=Paiement

  useEffect(() => {
    setLoading(true);
    if (!id) { setError("ID véhicule manquant."); setLoading(false); return; }
    if (!getVehicleById(id)) setError("Véhicule non trouvé. Retournez au catalogue.");
    setLoading(false);
  }, [id]);

  const isTrial = vehicle?.mode === "Acheter";

  // ── Pickup : méthode de prise en charge ───────────────────
  // pickupMethod: "livraison" (vendor vient) | "retrait" (client passe)
  // addressMode: "gps" | "text"
  const [pickupMethod, setPickupMethod]   = useState("livraison");
  const [addressMode,  setAddressMode]    = useState("gps");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPosition, setPickupPosition] = useState(null);

  // Remplir automatiquement avec le GPS disponible
  useEffect(() => {
    if (position && addressMode === "gps" && pickupMethod === "livraison") {
      setPickupAddress(geoAddress || `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
      setPickupPosition(position);
    }
  }, [position, geoAddress, addressMode, pickupMethod]);

  const handleDetectGPS = async () => {
    setGeoLoading(true);
    await refreshLocation();
    setTimeout(() => {
      if (position) {
        setPickupAddress(geoAddress || `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
        setPickupPosition(position);
      }
      setGeoLoading(false);
    }, 1500);
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

  const [selectedOptions, setSelectedOptions] = useState({
    gps: false, babySeat: false, insurance: false, driver: false,
  });

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

  const optionsTotal = Object.entries(selectedOptions).reduce((acc, [key, val]) => {
    if (!val) return acc;
    const opt = optionsData.find((o) => o.id === key);
    return acc + (opt?.price || 0) * Math.max(days, 1);
  }, 0);

  const baseTotal  = (vehicle.pricePerDay || 0) * Math.max(days, 1);
  const totalToPay = isTrial ? SERVICE_FEE : baseTotal + optionsTotal + SERVICE_FEE;

  // ── Handlers ─────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
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
        alert("Renseignez votre adresse de livraison."); return;
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

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (paymentForm.paymentMethod === "card") {
      const req = ["cardNumber", "cardHolder", "expiryDate", "cvv"];
      if (req.find((f) => !paymentForm[f])) { alert("Renseignez les informations de carte."); return; }
    }
    if (["orange", "wave", "mtn", "moov"].includes(paymentForm.paymentMethod) && !paymentForm.mobileNumber) {
      alert("Indiquez votre numéro mobile."); return;
    }

    const commissionRate   = isTrial ? 0.03 : 0.15;
    const commissionAmount = Math.round(baseTotal * commissionRate);
    const partnerPayout    = Math.max(baseTotal - commissionAmount - SERVICE_FEE, 0);

    const finalPickup = pickupMethod === "retrait"
      ? `Retrait chez le vendeur (${vehicle.pickupAddress || "adresse communiquée par le vendeur"})`
      : pickupAddress;

    const booking = isTrial
      ? {
          id: Date.now(), userId: user?.id,
          vehicleId: vehicle._id || vehicle.id,
          vehicleName: vehicle.name, vehicleMode: vehicle.mode,
          ...trialForm, type: "essai", status: "À confirmer",
          createdAt: new Date().toISOString(),
          serviceFeeFCFA: SERVICE_FEE, commissionRate, commissionAmount,
          paymentInfo: paymentForm, clientVerification: verificationForm,
        }
      : {
          id: Date.now(), userId: user?.id,
          vehicleId: vehicle._id || vehicle.id,
          vehicleName: vehicle.name, vehicleMode: vehicle.mode, vehicleType: vehicle.type,
          pricePerDay: vehicle.pricePerDay, ...form,
          pickupMethod, pickupAddress: finalPickup, pickupPosition,
          selectedOptions, days, optionsTotal, baseTotal,
          serviceFeeFCFA: SERVICE_FEE, total: totalToPay,
          createdAt: new Date().toISOString(),
          commissionRate, commissionAmount, partnerPayout,
          paidWith: paymentForm.paymentMethod,
          paymentInfo: paymentForm, clientVerification: verificationForm,
          type: "location",
        };

    addBooking(booking);

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(booking) });
    } catch { /* offline */ }

    navigate("/booking/success", { state: { booking, trial: isTrial, payment: paymentForm } });
  };

  const paymentOptions = [
    { value: "orange", label: "Orange Money" },
    { value: "wave",   label: "Wave" },
    { value: "mtn",    label: "MTN Mobile Money" },
    { value: "moov",   label: "Moov Money" },
    { value: "card",   label: "Carte bancaire" },
    { value: "paypal", label: "PayPal" },
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
                          {position ? (
                            <div className={styles.gpsDetected}>
                              <span>📍</span>
                              <div>
                                <strong>Position détectée</strong>
                                <p>{pickupAddress || geoAddress}</p>
                              </div>
                              <button type="button" className={styles.gpsRefreshBtn} onClick={handleDetectGPS} disabled={geoLoading}>
                                {geoLoading ? "⏳" : "↻ Actualiser"}
                              </button>
                            </div>
                          ) : (
                            <button type="button" className={styles.gpsDetectBtn} onClick={handleDetectGPS} disabled={geoLoading}>
                              {geoLoading ? "⏳ Détection en cours..." : "🎯 Détecter ma position GPS"}
                            </button>
                          )}
                          {pickupAddress && (
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
                          required
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
                </div>

                {/* Options */}
                <div className={styles.section}>
                  <h3>Options supplémentaires</h3>
                  <div className={styles.optionsGrid}>
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
