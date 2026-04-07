import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import styles from "./Booking.module.css";

const optionsData = [
  { id: "gps", label: "GPS intégré", price: 10000 },
  { id: "babySeat", label: "Siège bébé", price: 7000 },
  { id: "insurance", label: "Prime d'assurance", price: 15000 },
  { id: "driver", label: "Chauffeur privé", price: 50000 },
];

const Booking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const vehicles = useVehicles();
  const getVehicleById = vehicles.getItemById || ((id) => vehicles.vehicles?.find(v => String(v.id) === String(id) || v._id === String(id)));
  const addBooking = vehicles.addBooking;
  const { token } = useAuth();
  const vehicle = getVehicleById(id);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    if (!id) {
      setError("ID véhicule manquant.");
      setLoading(false);
      return;
    }
    if (getVehicleById) {
      const veh = getVehicleById(id);
      if (!veh) {
        setError("Véhicule non trouvé. Retournez au catalogue.");
      }
    }
    setLoading(false);
  }, [id, getVehicleById]);

  const isTrial = vehicle?.mode === "Acheter";
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    startDate: "",
    endDate: "",
    pickupLocation: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: "card",
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
    mobileProvider: "orange",
    mobileNumber: "",
  });

  const [trialForm, setTrialForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredDate: "",
    preferredTime: "",
    notes: "",
  });

  const [selectedOptions, setSelectedOptions] = useState({
    gps: false,
    babySeat: false,
    insurance: false,
    driver: false,
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Chargement de la réservation...
        </div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className={styles.page}>
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
          <h2>Erreur</h2>
          <p>{error || "Véhicule non trouvé"}</p>
          <button 
            onClick={() => navigate('/catalogue')}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '1rem'
            }}
          >
            Voir le catalogue
          </button>
        </div>
      </div>
    );
  }

  const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

  const days = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diff = Math.ceil((end - start) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 0;
  })();

  const optionsTotal = Object.entries(selectedOptions).reduce((acc, [key, value]) => {
    if (!value) return acc;
    const option = optionsData.find((o) => o.id === key);
    return acc + (option?.price || 0) * Math.max(days, 1);
  }, 0);

  const baseTotal = (vehicle.pricePerDay || 0) * Math.max(days, 1);
  const total = baseTotal + optionsTotal;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name in selectedOptions) {
      setSelectedOptions({ ...selectedOptions, [name]: checked });
      return;
    }

    if (name in form) {
      setForm({ ...form, [name]: value });
      return;
    }

    if (name in paymentForm) {
      setPaymentForm({ ...paymentForm, [name]: value });
      return;
    }
  };

  const handleTrialChange = (e) => {
    const { name, value } = e.target;
    setTrialForm({ ...trialForm, [name]: value });
  };

  const handleStepOneSubmit = (e) => {
    e.preventDefault();

    if (isTrial) {
      const required = ["firstName", "lastName", "email", "phone", "preferredDate", "preferredTime"];
      const invalid = required.find((field) => !trialForm[field]);
      if (invalid) {
        alert("Veuillez remplir tous les champs obligatoires pour l'essai.");
        return;
      }
      setStep(2);
      return;
    }

    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.startDate || !form.endDate || !form.pickupLocation) {
      alert("Veuillez renseigner tous les champs de réservation.");
      return;
    }
    if (days <= 0) {
      alert("La période doit être valide (date de fin > date de début)." );
      return;
    }

    setStep(2);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();

    if (!paymentForm.paymentMethod) {
      alert("Sélectionnez un mode de paiement.");
      return;
    }

    if (paymentForm.paymentMethod === "card") {
      const required = ["cardNumber", "cardHolder", "expiryDate", "cvv"];
      const invalid = required.find((field) => !paymentForm[field]);
      if (invalid) {
        alert("Veuillez remplir les informations de carte bancaire.");
        return;
      }
    }

    if (["orange", "wave", "mtn", "moov"].includes(paymentForm.paymentMethod)) {
      if (!paymentForm.mobileNumber) {
        alert("Veuillez indiquer votre numéro de mobile pour le paiement mobile.");
        return;
      }
    }

    let booking;
    if (isTrial) {
      booking = {
        id: Date.now(),
        vehicleId: vehicle._id || vehicle.id,
        vehicleName: vehicle.name,
        vehicleMode: vehicle.mode,
        vehicleType: vehicle.type,
        ...trialForm,
        type: "essai",
        status: "À confirmer",
        paymentInfo: paymentForm,
      };
    } else {
      booking = {
        id: Date.now(),
        vehicleId: vehicle._id || vehicle.id,
        vehicleName: vehicle.name,
        vehicleMode: vehicle.mode,
        vehicleType: vehicle.type,
        pricePerDay: vehicle.pricePerDay,
        ...form,
        selectedOptions,
        days,
        optionsTotal,
        baseTotal,
        total,
        paidWith: paymentForm.paymentMethod,
        paymentInfo: paymentForm,
        type: "location",
      };
    }

    addBooking(booking);

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch("/api/bookings", {
        method: "POST",
        headers,
        body: JSON.stringify(booking),
      });
    } catch {
      // Backend non disponible, réservation conservée côté client
    }

    navigate("/booking/success", { state: { booking, trial: isTrial, payment: paymentForm } });
  };

  const backToStepOne = () => setStep(1);

  const paymentOptions = [
    { value: "card", label: "Carte bancaire" },
    { value: "paypal", label: "PayPal" },
    { value: "applepay", label: "Apple Pay" },
    { value: "orange", label: "Orange Money" },
    { value: "wave", label: "Wave" },
    { value: "mtn", label: "MTN Mobile Money" },
    { value: "moov", label: "Moov Money" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1>{isTrial ? "Demander un essai" : "Réservez votre véhicule"}</h1>

        <div className={styles.stepIndicator}>
          <button className={`${styles.stepBtn} ${step === 1 ? styles.stepActive : ""}`} type="button">
            1. Réservation
          </button>
          <button className={`${styles.stepBtn} ${step === 2 ? styles.stepActive : ""}`} type="button" onClick={() => step === 2 && backToStepOne()}>
            2. Paiement
          </button>
        </div>

        {step === 1 && (
          <form onSubmit={handleStepOneSubmit} className={styles.form}>
            {isTrial ? (
              <>
                <div className={styles.section}>
                  <h3>Vos coordonnées</h3>
                  <div className={styles.row}>
                    <input
                      type="text"
                      name="firstName"
                      placeholder="Prénom"
                      value={trialForm.firstName}
                      onChange={handleTrialChange}
                      required
                    />
                    <input
                      type="text"
                      name="lastName"
                      placeholder="Nom"
                      value={trialForm.lastName}
                      onChange={handleTrialChange}
                      required
                    />
                  </div>
                  <div className={styles.row}>
                    <input
                      type="email"
                      name="email"
                      placeholder="E-mail"
                      value={trialForm.email}
                      onChange={handleTrialChange}
                      required
                    />
                    <input
                      type="tel"
                      name="phone"
                      placeholder="Téléphone"
                      value={trialForm.phone}
                      onChange={handleTrialChange}
                      required
                    />
                  </div>
                </div>

                <div className={styles.section}>
                  <h3>RDV d'essai</h3>
                  <div className={styles.row}>
                    <label>
                      Date
                      <input type="date" name="preferredDate" value={trialForm.preferredDate} onChange={handleTrialChange} required />
                    </label>
                    <label>
                      Heure
                      <input type="time" name="preferredTime" value={trialForm.preferredTime} onChange={handleTrialChange} required />
                    </label>
                  </div>
                  <textarea
                    name="notes"
                    placeholder="Notes (facultatif)"
                    value={trialForm.notes}
                    onChange={handleTrialChange}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={styles.section}>
                  <h3>Informations client</h3>
                  <div className={styles.row}>
                    <input
                      type="text"
                      name="firstName"
                      placeholder="Prénom"
                      value={form.firstName}
                      onChange={handleChange}
                      required
                    />
                    <input
                      type="text"
                      name="lastName"
                      placeholder="Nom"
                      value={form.lastName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className={styles.row}>
                    <input
                      type="email"
                      name="email"
                      placeholder="E-mail"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                    <input
                      type="tel"
                      name="phone"
                      placeholder="Téléphone"
                      value={form.phone}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className={styles.section}>
                  <h3>Dates & prise en charge</h3>
                  <div className={styles.row}>
                    <label>
                      Date de début
                      <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required />
                    </label>
                    <label>
                      Date de fin
                      <input type="date" name="endDate" value={form.endDate} onChange={handleChange} required />
                    </label>
                  </div>
                  <input
                    type="text"
                    name="pickupLocation"
                    placeholder="Lieu de prise en charge"
                    value={form.pickupLocation}
                    onChange={handleChange}
                    required
                  />
                </div>

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
              <button type="submit" className={styles.primaryBtn}>
                Continuer vers paiement
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handlePaymentSubmit} className={styles.form}>
            <div className={styles.section}>
              <h3>Méthode de paiement</h3>
              <div className={styles.optionsGrid}>
                {paymentOptions.map((option) => (
                  <label key={option.value} className={`${styles.optionItem} ${paymentForm.paymentMethod === option.value ? styles.optionActive : ""}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={option.value}
                      checked={paymentForm.paymentMethod === option.value}
                      onChange={handleChange}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {paymentForm.paymentMethod === "card" && (
              <div className={styles.section}>
                <h3>Informations de carte</h3>
                <div className={styles.row}>
                  <input type="text" name="cardNumber" value={paymentForm.cardNumber} onChange={handleChange} placeholder="Numéro de carte" required />
                  <input type="text" name="cardHolder" value={paymentForm.cardHolder} onChange={handleChange} placeholder="Nom sur la carte" required />
                </div>
                <div className={styles.row}>
                  <input type="text" name="expiryDate" value={paymentForm.expiryDate} onChange={handleChange} placeholder="MM/AA" required />
                  <input type="text" name="cvv" value={paymentForm.cvv} onChange={handleChange} placeholder="CVV" required />
                </div>
              </div>
            )}

            {paymentForm.paymentMethod !== "card" && (
              <div className={styles.section}>
                <h3>Détails de paiement mobile</h3>
                {(paymentForm.paymentMethod === "orange" || paymentForm.paymentMethod === "wave" || paymentForm.paymentMethod === "mtn" || paymentForm.paymentMethod === "moov") && (
                  <>
                    <p>Numéro mobile ({paymentForm.paymentMethod.toUpperCase()})</p>
                    <input type="tel" name="mobileNumber" value={paymentForm.mobileNumber} onChange={handleChange} placeholder="+221 77 000 00 00" required />
                  </>
                )}
              </div>
            )}

            <div className={styles.section}>
              <button type="button" className={styles.secondaryBtn} onClick={backToStepOne}>
                Retour
              </button>
              <button type="submit" className={styles.primaryBtn}>
                Confirmer et payer {isTrial ? "(Essai)" : fmt(total)}
              </button>
            </div>
          </form>
        )}
      </div>

      <aside className={styles.summaryCard}>
        <h3>Récapitulatif</h3>
        <div className={styles.summaryImage}>
          <img src={vehicle.image} alt={vehicle.name} />
          <span>{vehicle.name}</span>
        </div>

        {isTrial ? (
          <>
            <div className={styles.summaryItem}><span>Date essai</span><strong>{trialForm.preferredDate || "—"}</strong></div>
            <div className={styles.summaryItem}><span>Heure essai</span><strong>{trialForm.preferredTime || "—"}</strong></div>
            <div className={styles.summaryItem}><span>Statut</span><strong>À confirmer</strong></div>
          </>
        ) : (
          <>
            <div className={styles.summaryItem}><span>Prix base</span><strong>{baseTotal ? fmt(baseTotal) : "0 FCFA"}</strong></div>
            <div className={styles.summaryItem}><span>Options</span><strong>{fmt(optionsTotal)}</strong></div>
            <div className={styles.summaryItem}><span>Jours</span><strong>{days || 0}</strong></div>
            <div className={styles.summaryTotal}><span>Total TTC</span><strong>{fmt(total)}</strong></div>
          </>
        )}

        <p className={styles.guarantee}>Réservation sécurisée · Annulation gratuite jusqu'à 48h avant</p>
      </aside>
    </div>
  );
};

export default Booking;