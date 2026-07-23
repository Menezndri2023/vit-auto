import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import ReportButton from "../components/ReportButton/ReportButton";
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
  const [missionDate, setMissionDate] = useState("");
  const [missionTime, setMissionTime] = useState("");
  const [lieuDepart,  setLieuDepart]  = useState("");
  const [heures,    setHeures]    = useState(4);
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("orange_money");
  const [mobileNumber, setMobileNumber] = useState("");
  const [cardNumber,   setCardNumber]   = useState("");
  const [cardHolder,   setCardHolder]   = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Créneaux déjà réservés pour ce chauffeur — permet d'avertir le client
  // avant soumission plutôt que de découvrir le conflit après coup (le
  // serveur reste seul garant : voir bookingController.createBooking).
  useEffect(() => {
    if (!id) return;
    fetch(`/api/bookings/driver/${id}/occupied-slots`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.occupied) setOccupiedSlots(d.occupied); })
      .catch(() => {});
  }, [id]);

  const missionStart = useMemo(() => {
    if (!missionDate || !missionTime) return null;
    const dt = new Date(`${missionDate}T${missionTime}`);
    return isNaN(dt.getTime()) ? null : dt;
  }, [missionDate, missionTime]);

  const missionEnd = useMemo(() => {
    if (!missionStart) return null;
    return new Date(missionStart.getTime() + (Number(heures) || 0) * 3600000);
  }, [missionStart, heures]);

  const slotConflict = useMemo(() => {
    if (!missionStart || !missionEnd) return null;
    return occupiedSlots.find((s) => new Date(s.date) < missionEnd && new Date(s.dateFin) > missionStart) || null;
  }, [missionStart, missionEnd, occupiedSlots]);

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
    if (!missionStart) {
      error("Veuillez choisir la date et l'heure de la mission.");
      return;
    }
    if (missionStart < new Date()) {
      error("La date de la mission ne peut pas être dans le passé.");
      return;
    }
    if (!Number.isFinite(Number(heures)) || Number(heures) <= 0) {
      error("Nombre d'heures invalide.");
      return;
    }
    if (slotConflict) {
      error("Ce chauffeur est déjà réservé sur ce créneau. Choisissez une autre date/heure.");
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
          chauffeur: { date: missionStart.toISOString(), heures: Number(heures), lieuDepart: lieuDepart.trim() || undefined },
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

      // Paiement en ligne (carte/Orange Money/Wave) : redirection vers la
      // passerelle réelle — même logique que Booking.jsx. Les autres méthodes
      // (mtn/moov/cash) n'ont aucune intégration en ligne côté serveur (voir
      // paymentController.ONLINE_METHODS) et gardent la confirmation directe.
      if (["card", "orange_money", "wave"].includes(selectedMethod) && data.booking?._id) {
        try {
          const initRes = await fetch("/api/payments/initiate", {
            method: "POST", headers,
            body: JSON.stringify({ bookingId: data.booking._id, method: selectedMethod }),
          });
          const initData = await initRes.json().catch(() => ({}));
          if (initRes.ok && initData.checkoutUrl) {
            window.location.href = initData.checkoutUrl;
            return;
          }
          error("La passerelle de paiement est momentanément indisponible. Votre réservation est enregistrée, complétez le paiement depuis votre tableau de bord.");
          navigate("/booking/success", {
            state: { booking: data.booking, payment: { paymentMethod: selectedMethod, mobileNumber, initFailed: true } },
          });
          return;
        } catch {
          error("La passerelle de paiement est momentanément indisponible. Votre réservation est enregistrée, complétez le paiement depuis votre tableau de bord.");
          navigate("/booking/success", {
            state: { booking: data.booking, payment: { paymentMethod: selectedMethod, mobileNumber, initFailed: true } },
          });
          return;
        }
      }

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
        <div style={{ marginLeft: "auto" }}>
          <ReportButton targetType="driver" targetId={driver._id || driver.id} compact />
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

      {/* Date, heure & durée */}
      <h2 style={{ color: "#0f1b3f", fontSize: "1.05rem", marginBottom: 12 }}>Date et durée de la mission</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem" }}>Date *</span>
          <input type="date" value={missionDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setMissionDate(e.target.value)}
            style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem" }}>Heure de début *</span>
          <input type="time" value={missionTime}
            onChange={(e) => setMissionTime(e.target.value)}
            style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
        </label>
      </div>
      {slotConflict && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: "0.85rem", fontWeight: 600 }}>
          ⛔ Ce chauffeur est déjà réservé sur ce créneau. Choisissez une autre date/heure.
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
          Lieu de départ (optionnel)
        </label>
        <input type="text" placeholder="Ex : Aéroport Félix-Houphouët-Boigny, Abidjan" value={lieuDepart}
          onChange={(e) => setLieuDepart(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
      </div>
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

      <button onClick={handleSubmit} disabled={submitting || !missionStart || !!slotConflict}
        style={{
          width: "100%", padding: "15px", borderRadius: 14, border: "none",
          cursor: (submitting || !missionStart || slotConflict) ? "not-allowed" : "pointer",
          background: (submitting || !missionStart || slotConflict) ? "#94a3b8" : "linear-gradient(135deg, #ff4d2d, #e03519)",
          color: "#fff", fontWeight: 800, fontSize: "1rem",
        }}>
        {submitting ? "Envoi en cours…" : `Réserver ce chauffeur — ${fmt(total)}`}
      </button>
    </div>
  );
};

export default DriverBooking;
