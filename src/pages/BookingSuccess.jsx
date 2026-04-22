import { Link, useLocation } from "react-router-dom";
import styles from "./BookingSuccess.module.css";

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

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

const BookingSuccess = () => {
  const location = useLocation();
  const booking  = location.state?.booking;

  const contractNumber = `VIT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999) + 1).padStart(5, "0")}`;
  const today = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

  if (!booking) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <h1>Confirmation introuvable</h1>
          <p>Aucune réservation trouvée. Retournez au catalogue.</p>
          <Link to="/catalogue" className={styles.btnPrimary}>Voir le catalogue</Link>
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
          <p>Merci {booking.firstName} {booking.lastName}. Votre contrat numérique est généré ci-dessous.</p>
        </div>
      </div>

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
                <div className={styles.infoItem}><span>Date RDV</span><strong>{booking.preferredDate || "—"}</strong></div>
                <div className={styles.infoItem}><span>Heure</span><strong>{booking.preferredTime || "—"}</strong></div>
                <div className={styles.infoItem}><span>Notes</span><strong>{booking.notes || "Aucune"}</strong></div>
              </div>
            </div>
          ) : (
            <div className={styles.contractSection}>
              <h2>Modalités de location</h2>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><span>Date début</span><strong>{booking.startDate}</strong></div>
                <div className={styles.infoItem}><span>Date fin</span><strong>{booking.endDate}</strong></div>
                <div className={styles.infoItem}><span>Durée</span><strong>{booking.days} jour{booking.days > 1 ? "s" : ""}</strong></div>
                <div className={styles.infoItem}><span>Lieu de prise en charge</span><strong>{booking.pickupLocation}</strong></div>
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
              <div className={styles.fRow}><span>Frais de service plateforme</span><span>{fmt(booking.serviceFeeFCFA || 1000)}</span></div>
              <div className={`${styles.fRow} ${styles.fRowTotal}`}>
                <span>Total à payer</span>
                <span>{fmt(booking.total || booking.serviceFeeFCFA || 1000)}</span>
              </div>
              {!isEssai && (
                <div className={`${styles.fRow} ${styles.fRowCaution}`}>
                  <span>Caution de garantie (remboursable)</span>
                  <span>{fmt(booking.cautionAmount || 200000)}</span>
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
