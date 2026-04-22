import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import styles from "./Dashboard.module.css";

// ── Constantes ────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " FCFA";

const STATUS_CONFIG = {
  "À confirmer": { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  pending:       { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  confirmed:     { label: "Confirmé",    color: "#3b82f6", bg: "#eff6ff" },
  in_progress:   { label: "En cours",    color: "#8b5cf6", bg: "#f5f3ff" },
  completed:     { label: "Terminé",     color: "#10b981", bg: "#ecfdf5" },
  cancelled:     { label: "Annulé",      color: "#ef4444", bg: "#fef2f2" },
};

const PICKUP_LABELS = {
  livraison: "Livraison à domicile",
  retrait:   "Retrait chez le vendeur",
};

const PAYMENT_LABELS = {
  orange: "Orange Money",
  wave:   "Wave",
  mtn:    "MTN Mobile Money",
  moov:   "Moov Money",
  card:   "Carte bancaire",
  paypal: "PayPal",
};

const OPTIONS_LABELS = {
  gps:       "GPS intégré",
  babySeat:  "Siège bébé",
  insurance: "Assurance",
  driver:    "Chauffeur privé",
};

// ── Composant principal ───────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, isAuthenticated } = useAuth();
  const { bookings, removeBooking } = useVehicles();
  const [activeTab, setActiveTab] = useState("all");

  // ── Garde : non connecté ─────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.guardCard}>
          <div className={styles.guardIcon}>🔒</div>
          <h2>Connexion requise</h2>
          <p>Connectez-vous pour accéder à votre tableau de bord.</p>
          <Link to="/login" className={styles.primaryBtn}>Se connecter</Link>
        </div>
      </div>
    );
  }

  // ── Garde : partenaire (espace dédié) ────────────────────
  const isPartner = user?.role === "partenaire" || user?.role === "admin";
  if (isPartner) {
    return (
      <div className={styles.page}>
        <div className={styles.guardCard}>
          <div className={styles.guardIcon}>🤝</div>
          <h2>Espace partenaire</h2>
          <p>En tant que partenaire VIT AUTO, gérez vos annonces et commandes depuis votre espace dédié.</p>
          <Link to="/vendor/dashboard" className={styles.primaryBtn}>Mon espace partenaire →</Link>
        </div>
      </div>
    );
  }

  // ── Réservations de l'utilisateur connecté ───────────────
  const myBookings = useMemo(
    () => bookings.filter((b) => b.email === user?.email),
    [bookings, user?.email]
  );

  const now = new Date();

  const activeBookings = useMemo(
    () => myBookings.filter((b) => {
      if (b.status === "cancelled" || b.status === "completed") return false;
      if (b.type === "essai") return true;
      const end = new Date(b.endDate);
      return isNaN(end.getTime()) || end >= now;
    }),
    [myBookings]
  );

  const doneBookings = useMemo(
    () => myBookings.filter((b) =>
      b.status === "completed" || b.status === "cancelled" ||
      (b.type !== "essai" && !isNaN(new Date(b.endDate).getTime()) && new Date(b.endDate) < now)
    ),
    [myBookings]
  );

  const displayed = activeTab === "active" ? activeBookings
    : activeTab === "done"   ? doneBookings
    : myBookings;

  const totalSpent = myBookings.reduce(
    (s, b) => s + (b.total || b.serviceFeeFCFA || 0), 0
  );

  // ── Rendu ─────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── En-tête ───────────────────────────────────────── */}
      <header className={styles.header}>
        <div>
          <h1>Tableau de bord</h1>
          <p className={styles.welcome}>
            Bonjour <strong>{user?.firstName || user?.name || user?.email}</strong> — suivez toutes vos réservations
          </p>
        </div>
        <Link to="/catalogue" className={styles.ctaBtn}>
          + Nouvelle réservation
        </Link>
      </header>

      {/* ── Statistiques ──────────────────────────────────── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📋</span>
          <span className={styles.statNumber}>{myBookings.length}</span>
          <span className={styles.statLabel}>Total réservations</span>
        </div>
        <div className={`${styles.statCard} ${styles.statBlue}`}>
          <span className={styles.statIcon}>🚗</span>
          <span className={styles.statNumber}>{activeBookings.length}</span>
          <span className={styles.statLabel}>En cours</span>
        </div>
        <div className={`${styles.statCard} ${styles.statGreen}`}>
          <span className={styles.statIcon}>✅</span>
          <span className={styles.statNumber}>{doneBookings.length}</span>
          <span className={styles.statLabel}>Terminées</span>
        </div>
        <div className={`${styles.statCard} ${styles.statRed}`}>
          <span className={styles.statIcon}>💰</span>
          <span className={`${styles.statNumber} ${styles.statNumberSm}`}>{fmt(totalSpent)}</span>
          <span className={styles.statLabel}>Total dépensé</span>
        </div>
      </div>

      {/* ── Onglets ───────────────────────────────────────── */}
      <div className={styles.tabs}>
        {[
          { key: "all",    label: "Toutes",                count: myBookings.length     },
          { key: "active", label: "En cours",              count: activeBookings.length },
          { key: "done",   label: "Terminées / Annulées",  count: doneBookings.length   },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {count > 0 && <span className={styles.tabCount}>{count}</span>}
          </button>
        ))}
      </div>

      {/* ── Liste des réservations ─────────────────────────── */}
      {displayed.length === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>📭</div>
          <h3>Aucune réservation</h3>
          <p>
            {activeTab === "active"
              ? "Vous n'avez aucune réservation en cours."
              : activeTab === "done"
              ? "Aucune réservation terminée ou annulée."
              : "Vous n'avez pas encore effectué de réservation."}
          </p>
          <Link to="/catalogue" className={styles.primaryBtn}>Voir le catalogue</Link>
        </div>
      ) : (
        <div className={styles.bookingList}>
          {displayed.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onCancel={removeBooking} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Carte de réservation ──────────────────────────────────────────────────────
const BookingCard = ({ booking, onCancel }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);

  const status   = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const canCancel = booking.status === "À confirmer" || booking.status === "pending" || !booking.status;
  const isTrial  = booking.type === "essai";

  const startDate = booking.startDate ? new Date(booking.startDate).toLocaleDateString("fr-FR") : null;
  const endDate   = booking.endDate   ? new Date(booking.endDate).toLocaleDateString("fr-FR")   : null;

  const optionsSelected = Object.entries(booking.selectedOptions || {})
    .filter(([, v]) => v)
    .map(([k]) => OPTIONS_LABELS[k] || k);

  return (
    <div className={styles.bookingCard}>

      {/* ── Bandeau supérieur ─── */}
      <div className={styles.cardStripe} style={{ background: status.color }} />

      {/* ── En-tête carte ──────── */}
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <span className={styles.bookingTypeTag}>
            {isTrial ? "🔑 Essai" : "🚗 Location"}
          </span>
          <h3 className={styles.vehicleName}>{booking.vehicleName || "Véhicule"}</h3>
          {booking.vehicleType && (
            <p className={styles.vehicleMeta}>{booking.vehicleType}</p>
          )}
        </div>
        <span
          className={styles.statusBadge}
          style={{ color: status.color, background: status.bg }}
        >
          {status.label}
        </span>
      </div>

      {/* ── Détails ────────────── */}
      <div className={styles.cardBody}>
        {isTrial ? (
          <>
            <DetailRow icon="📅" label="Date du RDV" value={`${booking.preferredDate} à ${booking.preferredTime}`} />
            {booking.notes && <DetailRow icon="💬" label="Message" value={booking.notes} />}
          </>
        ) : (
          <>
            {startDate && endDate && (
              <DetailRow
                icon="📅"
                label="Période"
                value={`${startDate} → ${endDate}  (${booking.days} jour${booking.days > 1 ? "s" : ""})`}
              />
            )}
            {booking.pickupMethod && (
              <DetailRow
                icon={booking.pickupMethod === "livraison" ? "🚚" : "📍"}
                label="Prise en charge"
                value={`${PICKUP_LABELS[booking.pickupMethod] || booking.pickupMethod}${booking.pickupAddress ? ` — ${booking.pickupAddress}` : ""}`}
              />
            )}
            {optionsSelected.length > 0 && (
              <DetailRow icon="✅" label="Options" value={optionsSelected.join(", ")} />
            )}
            {booking.paidWith && (
              <DetailRow icon="💳" label="Paiement" value={PAYMENT_LABELS[booking.paidWith] || booking.paidWith} />
            )}
          </>
        )}
      </div>

      {/* ── Récapitulatif financier ── */}
      <div className={styles.cardFinance}>
        {!isTrial && booking.baseTotal > 0 && (
          <div className={styles.finRow}>
            <span>Location ({booking.days}j × {fmt(booking.pricePerDay)})</span>
            <span>{fmt(booking.baseTotal)}</span>
          </div>
        )}
        {!isTrial && booking.optionsTotal > 0 && (
          <div className={styles.finRow}>
            <span>Options</span>
            <span>{fmt(booking.optionsTotal)}</span>
          </div>
        )}
        <div className={styles.finRow}>
          <span>Frais de service VIT AUTO</span>
          <span>{fmt(booking.serviceFeeFCFA || 1000)}</span>
        </div>
        <div className={`${styles.finRow} ${styles.finTotal}`}>
          <span>Total réglé</span>
          <strong>{fmt(booking.total || booking.serviceFeeFCFA || 1000)}</strong>
        </div>
      </div>

      {/* ── Actions ─────────────── */}
      <div className={styles.cardActions}>
        {booking.vehicleId && (
          <Link to={`/vehicle/${booking.vehicleId}`} className={styles.btnSecondary}>
            Voir le véhicule
          </Link>
        )}

        {canCancel && !confirmCancel && (
          <button className={styles.btnDanger} onClick={() => setConfirmCancel(true)}>
            Annuler
          </button>
        )}

        {confirmCancel && (
          <div className={styles.confirmBar}>
            <span>Confirmer l'annulation ?</span>
            <button className={styles.btnDangerSm} onClick={() => onCancel(booking.id)}>
              Oui, annuler
            </button>
            <button className={styles.btnGhost} onClick={() => setConfirmCancel(false)}>
              Non
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Ligne de détail ───────────────────────────────────────────────────────────
const DetailRow = ({ icon, label, value }) => (
  <div className={styles.detailRow}>
    <span className={styles.detailLabel}>
      <span className={styles.detailIcon}>{icon}</span>
      {label}
    </span>
    <span className={styles.detailValue}>{value}</span>
  </div>
);

export default Dashboard;
