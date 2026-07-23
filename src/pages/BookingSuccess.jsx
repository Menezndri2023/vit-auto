import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./BookingSuccess.module.css";

const CONDITIONS = [
  "1. Le locataire s'engage à restituer le véhicule dans l'état décrit au moment de la prise en charge.",
  "2. Tout dommage constaté sera imputé sur la caution versée.",
  "3. Le véhicule doit être restitué avec le même niveau d'essence.",
  "4. L'utilisation hors territoire national est interdite sauf accord écrit.",
  "5. En cas d'accident ou panne, contacter immédiatement VIT AUTO.",
  "6. Le non-respect entraîne la perte totale ou partielle de la caution.",
  "7. Sous-location à un tiers formellement interdite.",
];

const OPTION_LABELS = {
  gps: "GPS intégré",
  babySeat: "Siège bébé",
  insurance: "Prime d'assurance",
  driver: "Chauffeur privé",
};

// Formate une date ISO ou YYYY-MM-DD en "20 décembre 2025"
const fmtDate = (d) => {
  if (!d) return "—";
  try {
    // Évite le décalage UTC en splitant la chaîne ISO
    const [year, month, day] = d.toString().split("T")[0].split("-");
    return new Date(Number(year), Number(month) - 1, Number(day))
      .toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return d; }
};

const BookingSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { fmt }  = useCurrency();
  const booking  = location.state?.booking;
  const paymentInitFailed = !!location.state?.payment?.initFailed;

  const contractNumber = `VIT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999) + 1).padStart(5, "0")}`;
  const today = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

  if (!booking) {
    return (
      <div style={{
        minHeight: "60vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", textAlign: "center",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
        <h2 style={{ color: "#0f1b3f", margin: "0 0 10px" }}>Aucune réservation trouvée</h2>
        <p style={{ color: "#5a6a8a", marginBottom: 24 }}>
          Cette page est accessible uniquement après une réservation.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/catalogue" style={{ background: "#ff4d2d", color: "#fff", padding: "12px 24px", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>
            Explorer le catalogue
          </Link>
          <button onClick={() => navigate(-1)} style={{ background: "transparent", border: "1.5px solid #d1d9e8", color: "#0f1b3f", padding: "11px 22px", borderRadius: 10, cursor: "pointer", fontWeight: 600 }}>
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  const isEssai = booking.type === "essai";
  const activeOptions = Object.entries(booking.selectedOptions || {})
    .filter(([, v]) => v)
    .map(([k]) => OPTION_LABELS[k] || k);

  const handlePrint = () => window.print();

  return (
    <div className={styles.page}>
      {/* ── Bandeau succès ─────────────────────── */}
      <div className={styles.successBanner}>
        <span className={styles.successIcon}>✓</span>
        <div>
          <h1>{isEssai ? "Demande d'essai envoyée !" : "Réservation confirmée !"}</h1>
          <p>Merci {booking.firstName || booking.clientInfo?.firstName || ""} {booking.lastName || booking.clientInfo?.lastName || ""}. Votre contrat numérique est généré ci-dessous.</p>
        </div>
      </div>

      {/* ── Avertissement paiement en ligne non initié ─────────────────── */}
      {paymentInitFailed && (
        <div style={{ background: "#fef3c7", border: "1.5px solid #f59e0b", borderRadius: 12, padding: "14px 18px", margin: "0 auto 1.5rem", maxWidth: 900, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.3rem" }}>⚠️</span>
          <div style={{ fontSize: ".88rem", color: "#78350f" }}>
            <strong>Votre réservation est bien enregistrée</strong>, mais le paiement en ligne n'a pas pu être initié (passerelle momentanément indisponible). Rendez-vous sur votre <Link to="/dashboard" style={{ color: "#78350f", textDecoration: "underline", fontWeight: 700 }}>tableau de bord</Link> pour réessayer le paiement, ou contactez le support.
          </div>
        </div>
      )}

      {/* ── Contrat digital ───────────────────── */}
      <div className={styles.contract} id="contract-to-print">
        {/* En-tête contrat */}
        <div className={styles.contractHeader}>
          <div className={styles.contractLogo}>
            <strong>VIT AUTO</strong>
            <span>Location & Vente de véhicules</span>
          </div>
          <div className={styles.contractMeta}>
            <div><span>N° Contrat</span><strong>{contractNumber}</strong></div>
            <div><span>Date émission</span><strong>{today}</strong></div>
            <div>
              <span>Type</span>
              <strong className={isEssai ? styles.tagEssai : styles.tagLocation}>
                {isEssai ? "Essai" : "Location"}
              </strong>
            </div>
          </div>
        </div>

        <div className={styles.contractBody}>
          {/* Parties */}
          <div className={styles.contractSection}>
            <h2>Parties du contrat</h2>
            <div className={styles.partiesGrid}>
              <div className={styles.party}>
                <h3>Le Bailleur</h3>
                <p><strong>VIT AUTO</strong></p>
                <p>Plateforme de location & vente de véhicules</p>
                <p>support@vitauto.ci</p>
              </div>
              <div className={styles.party}>
                <h3>Le Locataire</h3>
                <p><strong>{booking.firstName} {booking.lastName}</strong></p>
                <p>{booking.email}</p>
                <p>{booking.phone}</p>
                {booking.clientVerification?.idType && (
                  <p>
                    {booking.clientVerification.idType.toUpperCase()} : {booking.clientVerification.idNumber}
                  </p>
                )}
                {booking.clientVerification?.address && (
                  <p>{booking.clientVerification.address}</p>
                )}
              </div>
            </div>
          </div>

          {/* Véhicule */}
          <div className={styles.contractSection}>
            <h2>Véhicule concerné</h2>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}><span>Modèle</span><strong>{booking.vehicleName}</strong></div>
              <div className={styles.infoItem}><span>Type</span><strong>{booking.vehicleType || "—"}</strong></div>
              <div className={styles.infoItem}><span>Mode</span><strong>{booking.vehicleMode || "Location"}</strong></div>
              <div className={styles.infoItem}><span>Tarif journalier</span><strong>{fmt(booking.pricePerDay || 0)}</strong></div>
            </div>
          </div>

          {/* Modalités */}
          {isEssai ? (
            <div className={styles.contractSection}>
              <h2>Modalités de l'essai</h2>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><span>Date RDV</span><strong>{fmtDate(booking.preferredDate)}</strong></div>
                <div className={styles.infoItem}><span>Heure</span><strong>{booking.preferredTime || "—"}</strong></div>
                <div className={styles.infoItem}><span>Notes</span><strong>{booking.notes || "Aucune"}</strong></div>
              </div>
            </div>
          ) : (
            <div className={styles.contractSection}>
              <h2>Modalités de location</h2>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><span>Date début</span><strong>{fmtDate(booking.startDate)}</strong></div>
                <div className={styles.infoItem}><span>Date fin</span><strong>{fmtDate(booking.endDate)}</strong></div>
                <div className={styles.infoItem}><span>Durée</span><strong>{booking.days} jour{booking.days > 1 ? "s" : ""}</strong></div>
                <div className={styles.infoItem}><span>Lieu de prise en charge</span><strong>{booking.pickupLocation || booking.pickupAddress || "—"}</strong></div>
                {activeOptions.length > 0 && (
                  <div className={styles.infoItem}><span>Options</span><strong>{activeOptions.join(", ")}</strong></div>
                )}
              </div>
            </div>
          )}

          {/* Conditions financières */}
          <div className={styles.contractSection}>
            <h2>Conditions financières</h2>
            <div className={styles.financialTable}>
              {!isEssai && (
                <>
                  <div className={styles.fRow}><span>Prix de base</span><span>{fmt(booking.baseTotal || 0)}</span></div>
                  <div className={styles.fRow}><span>Options</span><span>{fmt(booking.optionsTotal || 0)}</span></div>
                </>
              )}
              <div className={styles.fRow}><span>Frais de service plateforme</span><span>{fmt(booking.serviceFeeFCFA || 0)}</span></div>
              <div className={`${styles.fRow} ${styles.fRowTotal}`}>
                <span>Total à payer</span>
                {/* montantTotal = champ backend, total = champ frontend booking */}
                <span>{fmt(booking.montantTotal || booking.total || 0)}</span>
              </div>
              {!isEssai && (booking.cautionAmount > 0) && (
                <div className={`${styles.fRow} ${styles.fRowCaution}`}>
                  <span>Caution de garantie (remboursable)</span>
                  <span>{fmt(booking.cautionAmount)}</span>
                </div>
              )}
              <div className={styles.fRow} style={{ color: "#64748b", fontSize: "0.82rem" }}>
                <span>Mode de paiement</span>
                <span>{booking.paidWith === "card" ? "Carte bancaire" : (booking.paidWith || "—")}</span>
              </div>
            </div>
          </div>

          {/* Conditions générales */}
          <div className={styles.contractSection}>
            <h2>Conditions générales</h2>
            <ol className={styles.conditionsList}>
              {CONDITIONS.map((c, i) => (
                <li key={i}>{c.replace(/^\d+\.\s/, "")}</li>
              ))}
            </ol>
          </div>

          {/* Signature */}
          <div className={styles.contractSection}>
            <h2>Signatures</h2>
            <div className={styles.signaturesGrid}>
              <div className={styles.signatureBox}>
                <p>Pour VIT AUTO</p>
                <div className={styles.signatureLine}>
                  <em>VIT AUTO — Service Contrats</em>
                </div>
                <small>Signature électronique validée</small>
              </div>
              <div className={styles.signatureBox}>
                <p>Le Locataire</p>
                <div className={styles.signatureLine}>
                  <em>{booking.firstName} {booking.lastName}</em>
                </div>
                <small>Accepté lors de la réservation en ligne</small>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contractFooter}>
          <p>Ce document constitue un contrat légalement opposable entre les parties.</p>
          <p>VIT AUTO — {today} — Réf. {contractNumber}</p>
        </div>
      </div>

      {/* ── Actions ──────────────────────────── */}
      <div className={styles.actions}>
        <button className={styles.btnPrint} onClick={handlePrint}>
          Imprimer / Télécharger PDF
        </button>
        <Link to="/catalogue" className={styles.btnPrimary}>
          Voir d'autres véhicules
        </Link>
        <Link to="/dashboard" className={styles.btnSecondary}>
          Mon tableau de bord
        </Link>
      </div>

      {/* ── Info support ─────────────────────── */}
      <div className={styles.supportBox}>
        <strong>Besoin d'aide ?</strong>
        <p>Notre support client est disponible 24h/7j — <a href="mailto:support@vitauto.ci">support@vitauto.ci</a></p>
      </div>
    </div>
  );
};

export default BookingSuccess;
