import { useParams, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Booking.module.css";

// Labels fixes (méthodes de paiement — même liste que Checkout.jsx)
const METHOD_LABELS = {
  orange_money: "Orange Money",
  wave:         "Wave",
  mtn:          "MTN Mobile Money",
  moov:         "Moov Money",
  card:         "Carte bancaire",
  cash:         "Espèces à la livraison",
};

const DriverBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getItemById } = useVehicles();
  const { user, token } = useAuth();
  const { success, error } = useToast();
  const { fmt } = useCurrency();

  const driver = getItemById(id);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName,  setLastName]  = useState(user?.lastName  || "");
  const [email,     setEmail]     = useState(user?.email     || "");
  const [phone,     setPhone]     = useState(user?.phone     || "");
  const [heures,    setHeures]    = useState(4);
  const [selectedMethod, setSelectedMethod] = useState("orange_money");
  const [mobileNumber, setMobileNumber] = useState("");
  const [cardNumber,   setCardNumber]   = useState("");
  const [cardHolder,   setCardHolder]   = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!driver) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 style={{ color: "#0f1b3f" }}>Chauffeur introuvable</h1>
        <p style={{ color: "#64748b" }}>Ce chauffeur n'est plus disponible ou n'existe pas.</p>
        <Link to="/catalogue?mode=Chauffeur" style={{ color: "#ff4d2d", fontWeight: 700 }}>← Retour aux chauffeurs</Link>
      </div>
    );
  }

  const tarifHeure = driver.tarifHeure || driver.tarif || 0;
  const total = tarifHeure * (Number(heures) || 0);

  const isMobile = ["orange_money", "wave", "mtn", "moov"].includes(selectedMethod);
  const isCard   = selectedMethod === "card";

  const handleSubmit = async () => {
    if (submitting) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      error("Veuillez remplir toutes vos informations.");
      return;
    }
    if (!Number.isFinite(Number(heures)) || Number(heures) <= 0) {
      error("Nombre d'heures invalide.");
      return;
    }
    if (isMobile && !mobileNumber.trim()) {
      error("Veuillez saisir votre numéro de téléphone mobile.");
      return;
    }
    if (isCard && (!cardNumber.trim() || !cardHolder.trim())) {
      error("Veuillez remplir les informations de carte.");
      return;
    }

    setSubmitting(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "chauffeur",
          driverId: id,
          clientInfo: { firstName, lastName, email, phone },
          chauffeur: { heures: Number(heures) },
          payment: {
            method: selectedMethod,
            mobileNumber: isMobile ? mobileNumber : undefined,
            // Seuls les 4 derniers chiffres quittent le navigateur (voir Booking.jsx/Checkout.jsx).
            cardLast4: isCard ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
            cardHolder: isCard ? cardHolder : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la réservation.");

      success("Réservation chauffeur envoyée ! En attente de confirmation.");
      navigate("/booking/success", {
        state: { booking: data.booking, payment: { paymentMethod: selectedMethod, mobileNumber } },
      });
    } catch (err) {
      error(err.message || "Erreur lors de la réservation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.content} style={{ maxWidth: 640, margin: "32px auto" }}>
      <Link to="/catalogue?mode=Chauffeur" style={{ color: "#64748b", fontSize: "0.85rem", textDecoration: "none" }}>← Tous les chauffeurs</Link>

      {/* Résumé chauffeur */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "16px 0 24px", padding: 16, background: "#f8fafc", borderRadius: 14, border: "1.5px solid #e5e9f4" }}>
        {driver.profilePhoto || driver.images?.[0]
          ? <img src={driver.profilePhoto || driver.images[0]} alt={`${driver.firstName} ${driver.lastName}`} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e5e9f4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🧑‍✈️</div>
        }
        <div>
          <strong style={{ color: "#0f1b3f", fontSize: "1.1rem" }}>{driver.firstName} {driver.lastName}</strong>
          <p style={{ margin: "2px 0", color: "#64748b", fontSize: "0.9rem" }}>{driver.title || "Chauffeur professionnel"}</p>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
            📍 {driver.zone || driver.ville || "—"} · {driver.experience || 0} ans d'expérience
            {driver.noteMoyenne > 0 && <> · ⭐ {driver.noteMoyenne.toFixed(1)} ({driver.nombreAvis || 0})</>}
          </p>
        </div>
      </div>

      {driver.description && (
        <p style={{ color: "#374151", fontSize: "0.92rem", marginBottom: 24 }}>{driver.description}</p>
      )}

      {/* Informations client */}
      <h2 style={{ color: "#0f1b3f", fontSize: "1.05rem", marginBottom: 12 }}>Vos informations</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <input className={styles.input} placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <input className={styles.input} placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <input className={styles.input} type="email" placeholder="E-mail *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={styles.input} type="tel" placeholder="Téléphone *" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {/* Durée */}
      <h2 style={{ color: "#0f1b3f", fontSize: "1.05rem", marginBottom: 12 }}>Durée de la mission</h2>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
          Nombre d'heures
        </label>
        <input type="number" min="1" max="24" value={heures}
          onChange={(e) => setHeures(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
          Tarif horaire : {fmt(tarifHeure)} / heure
        </p>
      </div>

      {/* Paiement */}
      <h2 style={{ color: "#0f1b3f", fontSize: "1.05rem", marginBottom: 12 }}>Mode de paiement</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {Object.entries(METHOD_LABELS).map(([val, label]) => (
          <label key={val} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 16px", borderRadius: 12, cursor: "pointer",
            border: `1.5px solid ${selectedMethod === val ? "#ff4d2d" : "#e5e9f4"}`,
            background: selectedMethod === val ? "#fff5f3" : "#fff",
            fontWeight: selectedMethod === val ? 700 : 400,
            color: selectedMethod === val ? "#ff4d2d" : "#374151",
          }}>
            <input type="radio" name="method" value={val} checked={selectedMethod === val}
              onChange={() => setSelectedMethod(val)} style={{ accentColor: "#ff4d2d" }} />
            {label}
          </label>
        ))}
      </div>

      {isMobile && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
            Numéro Mobile Money
          </label>
          <input type="tel" placeholder="Ex: +225 07 00 00 00 00" value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
        </div>
      )}

      {isCard && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
              Numéro de carte
            </label>
            <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
              Titulaire de la carte
            </label>
            <input type="text" placeholder="NOM PRÉNOM" value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
          </div>
        </div>
      )}

      {/* Total + confirmation */}
      <div style={{ background: "#f8fafc", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontWeight: 700 }}>Total estimé</span>
        <strong style={{ color: "#0f1b3f", fontSize: "1.2rem" }}>{fmt(total)}</strong>
      </div>

      <button onClick={handleSubmit} disabled={submitting}
        style={{
          width: "100%", padding: "15px", borderRadius: 14, border: "none", cursor: submitting ? "not-allowed" : "pointer",
          background: submitting ? "#94a3b8" : "linear-gradient(135deg, #ff4d2d, #e03519)",
          color: "#fff", fontWeight: 800, fontSize: "1rem",
        }}>
        {submitting ? "Envoi en cours…" : `Réserver ce chauffeur — ${fmt(total)}`}
      </button>
    </div>
  );
};

export default DriverBooking;
