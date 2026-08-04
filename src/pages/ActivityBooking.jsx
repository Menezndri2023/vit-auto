import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import ReportButton from "../components/ReportButton/ReportButton";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "../constants/activityTypes";
import styles from "./Booking.module.css";
import dbStyles from "./DriverBooking.module.css";

// Mêmes moyens de paiement que DriverBooking.jsx/Booking.jsx (voir Checkout.jsx).
const METHOD_LABELS = {
  orange_money: "Orange Money",
  wave:         "Wave",
  mtn:          "MTN Mobile Money",
  moov:         "Moov Money",
  card:         "Carte bancaire",
  cash:         "Espèces sur place",
};

const ActivityBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getItemById } = useVehicles();
  const { user, token } = useAuth();
  const { success, error } = useToast();
  const { fmt, getPaymentMethodsForCountry, catalogCountry, countryCode } = useCurrency();

  const activity = getItemById(id);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName,  setLastName]  = useState(user?.lastName  || "");
  const [email,     setEmail]     = useState(user?.email     || "");
  const [phone,     setPhone]     = useState(user?.phone     || "");
  const [passportNumber, setPassportNumber] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [activityTime, setActivityTime] = useState("");
  const [participants, setParticipants] = useState(1);
  const [wantEssai, setWantEssai] = useState(false);
  const [notes, setNotes] = useState("");
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("orange_money");
  const [mobileNumber, setMobileNumber] = useState("");
  const [cardNumber,   setCardNumber]   = useState("");
  const [cardHolder,   setCardHolder]   = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Créneaux déjà réservés pour cette activité — permet d'avertir le client
  // avant soumission ; le serveur reste seul garant (voir
  // bookingController.createBooking, capacité re-vérifiée atomiquement).
  useEffect(() => {
    if (!id) return;
    fetch(`/api/bookings/activity/${id}/occupied-slots`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.occupied) setOccupiedSlots(d.occupied); })
      .catch(() => {});
  }, [id]);

  const activityStart = useMemo(() => {
    if (!activityDate || !activityTime) return null;
    const dt = new Date(`${activityDate}T${activityTime}`);
    return isNaN(dt.getTime()) ? null : dt;
  }, [activityDate, activityTime]);

  const durationMinutes = wantEssai
    ? (activity?.essaiDurationMinutes || 30)
    : (activity?.durationMinutes || 60);

  const activityEnd = useMemo(() => {
    if (!activityStart) return null;
    return new Date(activityStart.getTime() + durationMinutes * 60000);
  }, [activityStart, durationMinutes]);

  // Capacité déjà réservée sur le créneau choisi — la réservation est bloquée
  // côté client dès que la capacité restante est insuffisante (le serveur
  // revérifie de toute façon dans une transaction, voir createBooking).
  const alreadyBookedOnSlot = useMemo(() => {
    if (!activityStart || !activityEnd) return 0;
    return occupiedSlots
      .filter((s) => new Date(s.date) < activityEnd && new Date(s.dateFin) > activityStart)
      .reduce((sum, s) => sum + (s.participants || 1), 0);
  }, [activityStart, activityEnd, occupiedSlots]);

  const remainingCapacity = Math.max(0, (activity?.capacity || 1) - alreadyBookedOnSlot);
  const capacityExceeded = activityStart && Number(participants) > remainingCapacity;

  if (!activity) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 className={dbStyles.driverName}>Activité introuvable</h1>
        <p className={dbStyles.driverSubtitle}>Cette activité n'est plus disponible ou n'existe pas.</p>
        <Link to="/catalogue?mode=Autres" className={dbStyles.notFoundLink}>← Retour aux activités</Link>
      </div>
    );
  }

  const unitPrice = wantEssai ? (activity.essaiPrice ?? activity.price) : activity.price;
  const total = activity.priceUnit === "per_person" ? unitPrice * (Number(participants) || 1) : unitPrice;

  const isMobile = ["orange_money", "wave", "mtn", "moov"].includes(selectedMethod);
  const isCard   = selectedMethod === "card";

  const allowedMethods = getPaymentMethodsForCountry(activity.country || catalogCountry || countryCode);
  const visibleMethodLabels = allowedMethods
    ? Object.fromEntries(Object.entries(METHOD_LABELS).filter(([val]) => allowedMethods.includes(val)))
    : METHOD_LABELS;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      error("Veuillez remplir toutes vos informations.");
      return;
    }
    if (!passportNumber.trim()) {
      error("Le numéro de passeport est obligatoire.");
      return;
    }
    if (!activityStart) {
      error("Veuillez choisir la date et l'heure de l'activité.");
      return;
    }
    if (activityStart < new Date()) {
      error("La date de l'activité ne peut pas être dans le passé.");
      return;
    }
    if (!Number.isFinite(Number(participants)) || Number(participants) <= 0) {
      error("Nombre de participants invalide.");
      return;
    }
    if (capacityExceeded) {
      error("Capacité insuffisante sur ce créneau pour ce nombre de participants.");
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
          type: "activite",
          activityId: id,
          clientInfo: { firstName, lastName, email, phone, passportNumber },
          activite: {
            date: activityStart.toISOString(),
            participants: Number(participants),
            essai: wantEssai,
            notes: notes.trim() || undefined,
          },
          payment: {
            method: selectedMethod,
            mobileNumber: isMobile ? mobileNumber : undefined,
            cardLast4: isCard ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
            cardHolder: isCard ? cardHolder : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la réservation.");

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

      success(wantEssai ? "Essai réservé !" : "Réservation envoyée ! En attente de confirmation.");
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
      <Link to="/catalogue?mode=Autres" className={dbStyles.backLink}>← Toutes les activités</Link>

      <div className={dbStyles.driverSummary}>
        {activity.thumbnail || activity.images?.[0]
          ? <img src={activity.thumbnail || activity.images[0]} alt={activity.title} className={dbStyles.driverAvatar} />
          : <div className={dbStyles.driverAvatarFallback}>{ACTIVITY_TYPE_ICONS[activity.activityType] || "🎟️"}</div>
        }
        <div>
          <strong className={dbStyles.driverName}>{activity.title}</strong>
          <p className={dbStyles.driverSubtitle}>{ACTIVITY_TYPE_ICONS[activity.activityType] || "🎟️"} {ACTIVITY_TYPE_LABELS[activity.activityType] || activity.activityType}</p>
          <p className={dbStyles.driverMeta}>
            📍 {activity.ville || "—"} · ⏱️ {activity.durationMinutes || 60} min · 👥 jusqu'à {activity.capacity || 1} pers.
            {activity.noteMoyenne > 0 && <> · ⭐ {activity.noteMoyenne.toFixed(1)} ({activity.nombreAvis || 0})</>}
          </p>
        </div>
        <div className={dbStyles.reportWrap}>
          <ReportButton targetType="activity" targetId={activity._id || activity.id} compact />
        </div>
      </div>

      {activity.description && (
        <p className={dbStyles.description}>{activity.description}</p>
      )}

      <h2 className={dbStyles.sectionTitle}>Vos informations</h2>
      <div className={dbStyles.formGrid2}>
        <input className={styles.input} placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <input className={styles.input} placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <input className={styles.input} type="email" placeholder="E-mail *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={styles.input} type="tel" placeholder="Téléphone *" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={`${styles.input} ${dbStyles.fieldFull}`} placeholder="N° de passeport *" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} />
      </div>

      {activity.essaiDisponible && (
        <div className={dbStyles.fieldBlockTight}>
          <label className={dbStyles.fieldLabel} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={wantEssai} onChange={(e) => setWantEssai(e.target.checked)} />
            🔰 Réserver un essai/découverte ({activity.essaiDurationMinutes || 30} min{activity.essaiPrice != null ? `, ${fmt(activity.essaiPrice)}` : ""}) au lieu de la session complète
          </label>
        </div>
      )}

      <h2 className={dbStyles.sectionTitle}>Date, heure et participants</h2>
      <div className={dbStyles.dateTimeGrid}>
        <label className={dbStyles.fieldCol}>
          <span className={dbStyles.fieldColLabel}>Date *</span>
          <input type="date" value={activityDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setActivityDate(e.target.value)}
            className={dbStyles.textInput} />
        </label>
        <label className={dbStyles.fieldCol}>
          <span className={dbStyles.fieldColLabel}>Heure *</span>
          <input type="time" value={activityTime}
            onChange={(e) => setActivityTime(e.target.value)}
            className={dbStyles.textInput} />
        </label>
      </div>
      {capacityExceeded && (
        <div className={dbStyles.conflictWarning}>
          ⛔ Capacité insuffisante sur ce créneau ({remainingCapacity} place(s) restante(s)). Choisissez une autre date/heure ou réduisez le nombre de participants.
        </div>
      )}
      <div className={dbStyles.fieldBlock}>
        <label className={dbStyles.fieldLabel}>Nombre de participants</label>
        <input type="number" min="1" max={activity.capacity || 1} value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          className={dbStyles.textInput} />
        <p className={dbStyles.hoursHint}>
          {activity.priceUnit === "per_session" ? "Prix forfaitaire, quel que soit le nombre de participants." : `${fmt(unitPrice)} par personne.`}
        </p>
      </div>
      <div className={dbStyles.fieldBlockTight}>
        <label className={dbStyles.fieldLabel}>Notes (optionnel)</label>
        <input type="text" placeholder="Ex : niveau débutant, allergie, préférence horaire..." value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={dbStyles.textInput} />
      </div>

      <h2 className={dbStyles.sectionTitle}>Mode de paiement</h2>
      <div className={dbStyles.paymentGrid}>
        {Object.entries(visibleMethodLabels).map(([val, label]) => (
          <label key={val} className={`${dbStyles.paymentOption} ${selectedMethod === val ? dbStyles.paymentOptionActive : ""}`}>
            <input type="radio" name="method" value={val} checked={selectedMethod === val}
              onChange={() => setSelectedMethod(val)} className={dbStyles.paymentRadio} />
            {label}
          </label>
        ))}
      </div>

      {isMobile && (
        <div className={dbStyles.fieldBlock}>
          <label className={dbStyles.fieldLabel}>Numéro Mobile Money</label>
          <input type="tel" placeholder="Ex: +225 07 00 00 00 00" value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            className={dbStyles.textInput} />
        </div>
      )}

      {isCard && (
        <div className={dbStyles.cardFieldsWrap}>
          <div>
            <label className={dbStyles.fieldLabel}>Numéro de carte</label>
            <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className={dbStyles.textInput} />
          </div>
          <div>
            <label className={dbStyles.fieldLabel}>Titulaire de la carte</label>
            <input type="text" placeholder="NOM PRÉNOM" value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              className={dbStyles.textInput} />
          </div>
        </div>
      )}

      <div className={dbStyles.totalBar}>
        <span className={dbStyles.totalLabel}>Total estimé</span>
        <strong className={dbStyles.totalValue}>{fmt(total)}</strong>
      </div>

      <button onClick={handleSubmit} disabled={submitting || !activityStart || capacityExceeded}
        className={dbStyles.submitBtn}>
        {submitting ? "Envoi en cours…" : `${wantEssai ? "Réserver l'essai" : "Réserver"} — ${fmt(total)}`}
      </button>
    </div>
  );
};

export default ActivityBooking;
