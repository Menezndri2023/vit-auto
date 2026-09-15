import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ReportButton from "../components/ReportButton/ReportButton";
import PriceTag from "../components/PriceTag/PriceTag";
import styles from "./Booking.module.css";
import dbStyles from "./DriverBooking.module.css";
import { MESSAGE_ESPECES } from "../constants/paiement";

const DriverBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getItemById } = useVehicles();
  const { user, token } = useAuth();
  const { success, error } = useToast();

  const driver = getItemById(id);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName,  setLastName]  = useState(user?.lastName  || "");
  const [email,     setEmail]     = useState(user?.email     || "");
  const [phone,     setPhone]     = useState(user?.phone     || "");
  // Documents liés à LA RÉSERVATION (restructuration 2026-09, même principe
  // que Booking.jsx) : un chauffeur professionnel conduit à la place du
  // client — seule la pièce d'identité est demandée, jamais de permis
  // (voir eligibilityEngine.js, bookingType "chauffeur" avec withDriver:true).
  // Demandée en dernière étape, pour conclure la réservation.
  const [missionDate, setMissionDate] = useState("");
  const [missionTime, setMissionTime] = useState("");
  const [lieuDepart,  setLieuDepart]  = useState("");
  // Unité de facturation : à l'heure, à la demi-journée ou à la journée —
  // choisie parmi celles que le chauffeur tarife (2026-09-14 : auparavant seul
  // le tarif horaire était réservable en ligne).
  const [unite,     setUnite]     = useState(null);
  const [quantite,  setQuantite]  = useState(1);
  const [occupiedSlots, setOccupiedSlots] = useState([]);
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

  // Unités de facturation proposées par CE chauffeur (mêmes règles que le
  // serveur, bookingController type "chauffeur") : chaque unité a son tarif,
  // jamais de repli d'une unité sur l'autre (le tarif journée × heures
  // surfacturait ×24).
  const UNITES = [
    { key: "heure",        label: "À l'heure",        tarif: Number(driver?.tarifHeure) || 0,       entered: driver?.tarifHeureEntered,       heures: 1,  unitLabel: "heure",        max: 24 },
    { key: "demi_journee", label: "Demi-journée",     tarif: Number(driver?.tarifDemiJournee) || 0, entered: driver?.tarifDemiJourneeEntered, heures: 4,  unitLabel: "demi-journée", max: 14 },
    { key: "journee",      label: "Journée complète", tarif: Number(driver?.tarif) || 0,            entered: driver?.tarifEntered,            heures: 24, unitLabel: "jour",         max: 31 },
  ].filter((u) => u.tarif > 0);
  const uniteActive = UNITES.find((u) => u.key === unite) || UNITES[0] || null;
  const qte = Math.max(1, Math.floor(Number(quantite) || 1));
  const heures = uniteActive ? uniteActive.heures * qte : 0;
  const total = uniteActive ? uniteActive.tarif * qte : 0;
  // Multiplier le montant SAISI (pas l'USD reconverti) préserve l'exactitude —
  // même principe que PriceTag (voir son commentaire) appliqué à un total calculé.
  const enteredTotal = uniteActive && uniteActive.entered != null ? uniteActive.entered * qte : null;

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


  const handleSubmit = async () => {
    if (submitting) return;
    // POST /api/bookings exige un compte (routes/bookings.js) : sans ce
    // renvoi, un visiteur non connecté recevait « Token manquant » en toast
    // (Booking.jsx avait déjà ce garde, pas les autres tunnels).
    if (!token) {
      navigate("/login", { state: { from: { pathname: window.location.pathname + window.location.search } } });
      return;
    }
    if (!uniteActive) {
      error("Ce chauffeur n'a pas encore de tarif réservable en ligne.");
      return;
    }
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
    if (!Number.isFinite(Number(quantite)) || Number(quantite) <= 0) {
      error(`Nombre de ${uniteActive.unitLabel}s invalide.`);
      return;
    }
    if (slotConflict) {
      error("Ce chauffeur est déjà réservé sur ce créneau. Choisissez une autre date/heure.");
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
          chauffeur: { date: missionStart.toISOString(), unite: uniteActive.key, quantite: qte, heures, lieuDepart: lieuDepart.trim() || undefined },
          // Chauffeur = espèces auprès du partenaire (TYPES_ESPECES_UNIQUEMENT,
          // règle serveur) : aucun choix à faire ici.
          payment: { method: "cash" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la réservation.");

      // Transmission directe (2026-09-14) : la demande part chez le
      // partenaire à l'instant, sans validation admin — voir
      // bookingController.createBooking (type "chauffeur").
      success("Demande transmise au partenaire ! Il vous répond dans les plus brefs délais.");
      navigate("/booking/success", {
        state: { booking: data.booking, payment: { paymentMethod: "cash" } },
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
      {(driver.identityVerified || driver.licenseVerified || driver.identityProvided || driver.licenseProvided || driver.cv) && (
        <div className={dbStyles.badges}>
          {driver.identityVerified ? (
            <span className={dbStyles.badgeVerified}>✓ Identité vérifiée</span>
          ) : driver.identityProvided && (
            <span className={dbStyles.badgeVerified}>📄 Identité fournie</span>
          )}
          {driver.licenseVerified ? (
            <span className={dbStyles.badgeVerified}>✓ Permis vérifié</span>
          ) : driver.licenseProvided && (
            <span className={dbStyles.badgeVerified}>📄 Permis fourni</span>
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
        <label className={dbStyles.fieldLabel}>Formule</label>
        {UNITES.length > 0 ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {UNITES.map((u) => (
                <button key={u.key} type="button" onClick={() => { setUnite(u.key); setQuantite(1); }}
                  aria-pressed={uniteActive?.key === u.key}
                  style={{ minHeight: 44, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${uniteActive?.key === u.key ? "#ff4d2d" : "#cbd5e1"}`, background: uniteActive?.key === u.key ? "#fff5f3" : "#fff", color: uniteActive?.key === u.key ? "#c2410c" : "#0f1b3f", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {u.label} · <PriceTag amountUSD={u.tarif} pinnedCurrency={driver.currency} enteredAmount={u.entered} enteredCurrency={driver.priceEntryCurrency} compact />
                </button>
              ))}
            </div>
            <label className={dbStyles.fieldLabel}>Nombre de {uniteActive.unitLabel}s</label>
            <input type="number" min="1" max={uniteActive.max} value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              className={dbStyles.textInput} />
            <p className={dbStyles.hoursHint}>
              {uniteActive.key === "heure" && "Mission facturée à l'heure, à partir de l'heure de départ."}
              {uniteActive.key === "demi_journee" && "Une demi-journée = 4 heures de mise à disposition."}
              {uniteActive.key === "journee" && "Journée complète : le chauffeur est réservé pour la ou les journées choisies."}
            </p>
          </>
        ) : (
          <div className={dbStyles.noRateWarning}>
            ⚠️ Ce chauffeur n'a pas encore de tarif réservable en ligne. Le service client VIT AUTO peut organiser la mission pour vous.
          </div>
        )}
      </div>

      {/* Paiement : espèces uniquement pour une mission chauffeur (voir
          src/constants/paiement.js) — la demande part directement chez le
          partenaire, qui l'accepte ou la refuse. */}
      <h2 className={dbStyles.sectionTitle}>Paiement et transmission</h2>
      <p style={{ margin: "0 0 4px", fontSize: ".86rem", color: "#475569", lineHeight: 1.55 }}>
        {MESSAGE_ESPECES}
      </p>
      <p style={{ margin: "0 0 18px", fontSize: ".86rem", color: "#475569", lineHeight: 1.55 }}>
        Votre demande est transmise <strong>directement au partenaire</strong>, sans étape intermédiaire : vous êtes prévenu(e) dès sa réponse.
      </p>

      {/* Aucun document demandé au client pour une mission chauffeur (décision
          de l'exploitant, 2026-09-15) : c'est le chauffeur partenaire qui a
          fourni identité et permis à la publication de son profil. Le client
          ne conduit pas. Même règle côté serveur (eligibilityEngine). */}

      {/* Total + confirmation */}
      <div className={dbStyles.totalBar}>
        <span className={dbStyles.totalLabel}>Total estimé</span>
        <strong className={dbStyles.totalValue}>
          <PriceTag amountUSD={total} pinnedCurrency={driver.currency} enteredAmount={enteredTotal} enteredCurrency={driver.priceEntryCurrency} />
        </strong>
      </div>

      <button onClick={handleSubmit} disabled={submitting || !missionStart || !!slotConflict || !uniteActive}
        className={dbStyles.submitBtn}>
        {submitting ? "Envoi en cours…" : "Réserver ce chauffeur"}
      </button>
    </div>
  );
};

export default DriverBooking;
