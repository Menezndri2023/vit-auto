import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import ReportButton from "../components/ReportButton/ReportButton";
import PriceTag from "../components/PriceTag/PriceTag";
import styles from "./Booking.module.css";
import dbStyles from "./DriverBooking.module.css";

// Moyens de paiement disponibles au choix du client (voir Checkout.jsx).
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
  const { getPaymentMethodsForCountry, catalogCountry, countryCode } = useCurrency();

  const driver = getItemById(id);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName,  setLastName]  = useState(user?.lastName  || "");
  const [email,     setEmail]     = useState(user?.email     || "");
  const [phone,     setPhone]     = useState(user?.phone     || "");
  const [passportNumber, setPassportNumber] = useState("");
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
        <h1 className={dbStyles.driverName}>Chauffeur introuvable</h1>
        <p className={dbStyles.driverSubtitle}>Ce chauffeur n'est plus disponible ou n'existe pas.</p>
        <Link to="/catalogue?mode=Chauffeur" className={dbStyles.notFoundLink}>← Retour aux chauffeurs</Link>
      </div>
    );
  }

  // Cette page ne facture qu'à l'heure (durée de mission en heures) — utiliser le
  // tarif JOURNÉE en repli aurait multiplié la facture par ~24 pour une mission de
  // quelques heures (bug réel : {tarifHeure || tarif} confondait les deux unités).
  // Sans tarif horaire renseigné, on affiche le tarif journée/demi-journée à titre
  // indicatif et on bloque la réservation en ligne (voir handleSubmit).
  const hasHourlyRate = Number(driver.tarifHeure) > 0;
  const tarifHeure = hasHourlyRate ? Number(driver.tarifHeure) : 0;
  const total = tarifHeure * (Number(heures) || 0);
  // Multiplier le montant SAISI (pas l'USD reconverti) préserve l'exactitude —
  // même principe que PriceTag (voir son commentaire) appliqué à un total calculé.
  const enteredTotal = driver.tarifHeureEntered != null ? driver.tarifHeureEntered * (Number(heures) || 0) : null;

  const isMobile = ["orange_money", "wave", "mtn", "moov"].includes(selectedMethod);
  const isCard   = selectedMethod === "card";

  // Restreint les moyens de paiement à ceux activés par l'admin pour le pays du
  // chauffeur (CountryConfig.paymentMethods) — voir Checkout.jsx pour le même mécanisme.
  const allowedMethods = getPaymentMethodsForCountry(driver.country || catalogCountry || countryCode);
  const visibleMethodLabels = allowedMethods
    ? Object.fromEntries(Object.entries(METHOD_LABELS).filter(([val]) => allowedMethods.includes(val)))
    : METHOD_LABELS;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!hasHourlyRate) {
      error("Ce chauffeur n'a pas de tarif horaire — contactez-le directement pour une mission à la journée ou demi-journée.");
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      error("Veuillez remplir toutes vos informations.");
      return;
    }
    if (!passportNumber.trim()) {
      error("Le numéro de passeport est obligatoire.");
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
          clientInfo: { firstName, lastName, email, phone, passportNumber },
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
      <Link to="/catalogue?mode=Chauffeur" className={dbStyles.backLink}>← Tous les chauffeurs</Link>

      {/* Résumé chauffeur */}
      <div className={dbStyles.driverSummary}>
        {driver.profilePhoto || driver.images?.[0]
          ? <img src={driver.profilePhoto || driver.images[0]} alt={`${driver.firstName} ${driver.lastName}`} className={dbStyles.driverAvatar} />
          : <div className={dbStyles.driverAvatarFallback}>🧑‍✈️</div>
        }
        <div>
          <strong className={dbStyles.driverName}>{driver.firstName} {driver.lastName}</strong>
          <p className={dbStyles.driverSubtitle}>{driver.title || "Chauffeur professionnel"}</p>
          <p className={dbStyles.driverMeta}>
            📍 {driver.zone || driver.ville || "—"} · {driver.experience || 0} ans d'expérience
            {driver.noteMoyenne > 0 && <> · ⭐ {driver.noteMoyenne.toFixed(1)} ({driver.nombreAvis || 0})</>}
          </p>
          <p className={dbStyles.driverMetaTop}>
            {driver.vehiculePersonnel ? `🚗 Avec véhicule${driver.typeVehicule ? ` (${driver.typeVehicule})` : ""}` : "🚶 Sans véhicule — conduit votre véhicule"}
          </p>
          {driver.langues?.length > 0 && (
            <p className={dbStyles.driverMetaTop}>💬 {driver.langues.join(", ")}</p>
          )}
        </div>
        <div className={dbStyles.reportWrap}>
          <ReportButton targetType="driver" targetId={driver._id || driver.id} compact />
        </div>
      </div>

      {/* Badges de vérification — booléens calculés côté serveur (getDrivers),
          jamais les documents/images bruts (identité, permis) qui restent
          strictement privés et visibles uniquement par l'admin. */}
      {(driver.identityVerified || driver.licenseVerified || driver.cv) && (
        <div className={dbStyles.badges}>
          {driver.identityVerified && (
            <span className={dbStyles.badgeVerified}>✓ Identité vérifiée</span>
          )}
          {driver.licenseVerified && (
            <span className={dbStyles.badgeVerified}>✓ Permis vérifié</span>
          )}
          {driver.cv && (
            <a href={driver.cv} target="_blank" rel="noopener noreferrer" className={dbStyles.badgeCv}>
              📄 Voir le CV
            </a>
          )}
        </div>
      )}

      {driver.description && (
        <p className={dbStyles.description}>{driver.description}</p>
      )}

      {/* Alternative à la mission ponctuelle ci-dessous : embauche durable CDD/CDI */}
      <Link to={`/driver-employment/${driver._id || driver.id}`} className={dbStyles.employLink}>
        💼 Employer ce chauffeur à temps plein (CDD / CDI)
      </Link>

      {/* Photos du véhicule (chauffeur avec véhicule) — distinctes de la photo de profil ci-dessus */}
      {driver.vehiculePersonnel && Array.isArray(driver.images) && driver.images.length > 0 && (
        <div className={dbStyles.vehiclePhotos}>
          <h2 className={dbStyles.vehiclePhotosTitle}>Photos du véhicule</h2>
          <div className={dbStyles.vehiclePhotosGrid}>
            {driver.images.map((src, i) => (
              <img key={i} src={src} alt={`Véhicule ${i + 1}`} className={dbStyles.vehiclePhotoImg} loading="lazy" decoding="async" />
            ))}
          </div>
        </div>
      )}

      {/* Informations client */}
      <h2 className={dbStyles.sectionTitle}>Vos informations</h2>
      <div className={dbStyles.formGrid2}>
        <input className={styles.input} placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <input className={styles.input} placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <input className={styles.input} type="email" placeholder="E-mail *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={styles.input} type="tel" placeholder="Téléphone *" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={`${styles.input} ${dbStyles.fieldFull}`} placeholder="N° de passeport *" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} />
      </div>

      {/* Date, heure & durée */}
      <h2 className={dbStyles.sectionTitle}>Date et durée de la mission</h2>
      <div className={dbStyles.dateTimeGrid}>
        <label className={dbStyles.fieldCol}>
          <span className={dbStyles.fieldColLabel}>Date *</span>
          <input type="date" value={missionDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setMissionDate(e.target.value)}
            className={dbStyles.textInput} />
        </label>
        <label className={dbStyles.fieldCol}>
          <span className={dbStyles.fieldColLabel}>Heure de début *</span>
          <input type="time" value={missionTime}
            onChange={(e) => setMissionTime(e.target.value)}
            className={dbStyles.textInput} />
        </label>
      </div>
      {slotConflict && (
        <div className={dbStyles.conflictWarning}>
          ⛔ Ce chauffeur est déjà réservé sur ce créneau. Choisissez une autre date/heure.
        </div>
      )}
      <div className={dbStyles.fieldBlockTight}>
        <label className={dbStyles.fieldLabel}>Lieu de départ (optionnel)</label>
        <input type="text" placeholder="Ex : Aéroport Félix-Houphouët-Boigny, Abidjan" value={lieuDepart}
          onChange={(e) => setLieuDepart(e.target.value)}
          className={dbStyles.textInput} />
      </div>
      <div className={dbStyles.fieldBlock}>
        <label className={dbStyles.fieldLabel}>Nombre d'heures</label>
        <input type="number" min="1" max="24" value={heures} disabled={!hasHourlyRate}
          onChange={(e) => setHeures(e.target.value)}
          className={dbStyles.textInput} />
        {hasHourlyRate ? (
          <p className={dbStyles.hoursHint}>
            Tarif horaire : <PriceTag amountUSD={tarifHeure} pinnedCurrency={driver.currency} enteredAmount={driver.tarifHeureEntered} enteredCurrency={driver.priceEntryCurrency} compact /> / heure
          </p>
        ) : (
          <div className={dbStyles.noRateWarning}>
            ⚠️ Ce chauffeur ne propose pas de tarif horaire — réservation en ligne indisponible.
            {(driver.tarif > 0 || driver.tarifDemiJournee > 0) && (
              <>
                {" "}Contactez-le directement pour ses tarifs
                {driver.tarif > 0 && <> journée (<PriceTag amountUSD={driver.tarif} pinnedCurrency={driver.currency} enteredAmount={driver.tarifEntered} enteredCurrency={driver.priceEntryCurrency} compact />)</>}
                {driver.tarif > 0 && driver.tarifDemiJournee > 0 && " / "}
                {driver.tarifDemiJournee > 0 && <> demi-journée (<PriceTag amountUSD={driver.tarifDemiJournee} pinnedCurrency={driver.currency} enteredAmount={driver.tarifDemiJourneeEntered} enteredCurrency={driver.priceEntryCurrency} compact />)</>}.
              </>
            )}
          </div>
        )}
      </div>

      {/* Paiement */}
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

      {/* Total + confirmation */}
      <div className={dbStyles.totalBar}>
        <span className={dbStyles.totalLabel}>Total estimé</span>
        <strong className={dbStyles.totalValue}>
          <PriceTag amountUSD={total} pinnedCurrency={driver.currency} enteredAmount={enteredTotal} enteredCurrency={driver.priceEntryCurrency} />
        </strong>
      </div>

      <button onClick={handleSubmit} disabled={submitting || !missionStart || !!slotConflict || !hasHourlyRate}
        className={dbStyles.submitBtn}>
        {submitting ? "Envoi en cours…" : "Employer ce chauffeur"}
      </button>
    </div>
  );
};

export default DriverBooking;
