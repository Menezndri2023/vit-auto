import { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import styles from "./Dashboard.module.css";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " FCFA";

const STATUS_CONFIG = {
  "À confirmer": { label: "En attente",     color: "#f59e0b", bg: "#fffbeb" },
  pending:       { label: "En attente",     color: "#f59e0b", bg: "#fffbeb" },
  confirmed:     { label: "Acceptée",       color: "#10b981", bg: "#ecfdf5" },
  preparing:     { label: "En cours",       color: "#06b6d4", bg: "#ecfeff" },
  ready:         { label: "Prêt !",         color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:   { label: "En route",       color: "#3b82f6", bg: "#eff6ff" },
  completed:     { label: "Terminée",       color: "#64748b", bg: "#f8fafc" },
  cancelled:     { label: "Annulée",        color: "#ef4444", bg: "#fef2f2" },
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

// ── Étapes de suivi de livraison (6 étapes) ──────────────────────────────────
const TRACKING_STEPS = [
  { key: "pending",     label: "Reçue",      icon: "📋", desc: "Votre demande a été envoyée au partenaire" },
  { key: "confirmed",   label: "Acceptée",   icon: "✅", desc: "Le partenaire a accepté votre réservation" },
  { key: "preparing",   label: "En cours",   icon: "⚙️", desc: "Le partenaire prépare votre véhicule" },
  { key: "ready",       label: "Prêt !",     icon: "🚗", desc: "Votre véhicule est prêt pour la livraison" },
  { key: "in_progress", label: "En route",   icon: "🚀", desc: "Le partenaire est en route vers vous" },
  { key: "completed",   label: "Terminée",   icon: "🏁", desc: "Location terminée — merci !" },
];

const STEP_ORDER_CLIENT = ["pending", "confirmed", "preparing", "ready", "in_progress", "completed"];

function getStepIndex(status) {
  const idx = STEP_ORDER_CLIENT.indexOf(status);
  if (idx !== -1) return idx;
  if (status === "À confirmer") return 0;
  return 0;
}

// ── Timeline suivi ────────────────────────────────────────────────────────────
function DeliveryTimeline({ booking }) {
  const currentIdx  = getStepIndex(booking.status);
  const isCancelled = booking.status === "cancelled";

  if (isCancelled) {
    return (
      <div className={styles.timelineCancelled}>
        <span>❌</span>
        <span>Commande annulée{booking.vendorNote ? ` — ${booking.vendorNote}` : ""}</span>
      </div>
    );
  }

  const currentStep = TRACKING_STEPS[currentIdx];

  return (
    <div className={styles.timelineWrapper}>
      {/* Barre de progression */}
      <div className={styles.timeline}>
        {TRACKING_STEPS.map((step, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step.key} className={styles.timelineStep}>
              <div className={[
                styles.timelineDot,
                isDone    ? styles.timelineDotDone   : "",
                isCurrent ? styles.timelineDotActive : "",
              ].join(" ")}>
                <span>{isDone ? "✓" : step.icon}</span>
              </div>
              {idx < TRACKING_STEPS.length - 1 && (
                <div className={`${styles.timelineLine}${isDone ? ` ${styles.timelineLineDone}` : ""}`} />
              )}
              <span className={`${styles.timelineLabel}${isCurrent ? ` ${styles.timelineLabelActive}` : ""}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Description étape courante */}
      {currentStep && booking.status !== "completed" && (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>{currentStep.icon}</span>
          <span>{currentStep.desc}</span>
        </div>
      )}
      {/* Alertes contextuelles selon statut */}
      {booking.status === "confirmed" && (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>✅</span>
          <span>Réservation acceptée ! Le partenaire prépare votre véhicule.</span>
        </div>
      )}
      {booking.status === "preparing" && (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>⚙️</span>
          <span>Votre véhicule est en cours de préparation.</span>
        </div>
      )}
      {booking.status === "ready" && (
        <div className={styles.readyAlert}>
          <span>🎉</span>
          <span>Votre véhicule est prêt ! Le partenaire va vous contacter pour la livraison.</span>
        </div>
      )}
      {booking.status === "in_progress" && (
        <div className={styles.enRouteAlertClient}>
          <span>🚀</span>
          <span>Le partenaire est en route vers vous. Préparez votre pièce d'identité.</span>
        </div>
      )}
    </div>
  );
}

// ── Modal avis ────────────────────────────────────────────────────────────────
function ReviewModal({ booking, token, onClose, onSuccess }) {
  const [note, setNote] = useState(5);
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!token || !booking.vehicleId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: booking.id,
          targetType: "vehicle",
          targetId: booking.vehicleId,
          note,
          commentaire,
        }),
      });
      if (res.ok) { onSuccess(); onClose(); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.reviewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.reviewHeader}>
          <h3>Laisser un avis</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p className={styles.reviewVehicle}>{booking.vehicleName}</p>
        <div className={styles.starRow}>
          {[1,2,3,4,5].map((s) => (
            <button key={s} className={`${styles.star} ${s <= note ? styles.starOn : ""}`} onClick={() => setNote(s)}>★</button>
          ))}
          <span className={styles.noteLabel}>{note}/5</span>
        </div>
        <textarea
          className={styles.reviewTextarea}
          rows={4}
          placeholder="Partagez votre expérience avec ce véhicule..."
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
        />
        <div className={styles.reviewActions}>
          <button className={styles.btnSubmitReview} onClick={submit} disabled={loading || !commentaire.trim()}>
            {loading ? "Envoi..." : "Publier l'avis"}
          </button>
          <button className={styles.btnGhost} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, isAuthenticated, token } = useAuth();
  const { bookings, removeBooking, loadMyOrders } = useVehicles();
  const { success: toastSuccess } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  const [reviewTarget, setReviewTarget] = useState(null);

  const handleReviewSuccess = useCallback(() => {
    toastSuccess("Merci pour votre avis !");
  }, [toastSuccess]);

  // Synchroniser avec le backend au montage — TOUS les hooks avant les early returns
  useEffect(() => {
    if (token) loadMyOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const now = new Date();

  // Ces useMemo doivent être AVANT les early returns (règles des hooks React)
  const myBookings = useMemo(
    () => (isAuthenticated && user ? bookings.filter((b) => b.email === user.email) : []),
    [bookings, user, isAuthenticated]
  );

  const activeBookings = useMemo(
    () => myBookings.filter((b) => {
      if (b.status === "cancelled" || b.status === "completed") return false;
      if (b.type === "essai") return true;
      const end = new Date(b.endDate);
      return isNaN(end.getTime()) || end >= now;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myBookings]
  );

  const doneBookings = useMemo(
    () => myBookings.filter((b) =>
      b.status === "completed" || b.status === "cancelled" ||
      (b.type !== "essai" && !isNaN(new Date(b.endDate).getTime()) && new Date(b.endDate) < now)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myBookings]
  );

  const totalSpent = useMemo(
    () => myBookings.reduce((s, b) => s + (b.total || b.serviceFeeFCFA || 0), 0),
    [myBookings]
  );

  // ── Early returns APRÈS tous les hooks ──────────────────
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

  const displayed = activeTab === "active" ? activeBookings
    : activeTab === "done"   ? doneBookings
    : myBookings;

  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
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

      {/* ── Statistiques ── */}
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

      {/* ── Onglets ── */}
      <div className={styles.tabs}>
        {[
          { key: "all",    label: "Toutes",               count: myBookings.length     },
          { key: "active", label: "En cours",             count: activeBookings.length },
          { key: "done",   label: "Terminées / Annulées", count: doneBookings.length   },
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

      {/* ── Liste des réservations ── */}
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
            <BookingCard key={booking.id} booking={booking} onCancel={removeBooking} onReview={setReviewTarget} />
          ))}
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          booking={reviewTarget}
          token={token}
          onClose={() => setReviewTarget(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
};

// ── Carte de réservation ──────────────────────────────────────────────────────
const BookingCard = ({ booking, onCancel, onReview }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);

  const status      = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const canCancel   = booking.status === "À confirmer" || booking.status === "pending" || !booking.status;
  const isCompleted = booking.status === "completed";
  const isActive    = booking.status === "confirmed" || booking.status === "in_progress";
  const isTrial   = booking.type === "essai";

  const startDate = booking.startDate ? new Date(booking.startDate).toLocaleDateString("fr-FR") : null;
  const endDate   = booking.endDate   ? new Date(booking.endDate).toLocaleDateString("fr-FR")   : null;

  const optionsSelected = Object.entries(booking.selectedOptions || {})
    .filter(([, v]) => v)
    .map(([k]) => OPTIONS_LABELS[k] || k);

  const hasGps      = booking.pickupLat != null && booking.pickupLng != null;
  const isLivraison = booking.pickupMethod === "livraison";
  const mapsUrl     = hasGps
    ? `https://www.google.com/maps?q=${booking.pickupLat},${booking.pickupLng}`
    : booking.pickupAddress
      ? `https://www.google.com/maps/search/${encodeURIComponent(booking.pickupAddress)}`
      : null;

  return (
    <div className={styles.bookingCard}>
      <div className={styles.cardStripe} style={{ background: status.color }} />

      {/* ── En-tête ── */}
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <span className={styles.bookingTypeTag}>
            {isTrial ? "🔑 Essai" : "🚗 Location"}
          </span>
          <h3 className={styles.vehicleName}>{booking.vehicleName || "Véhicule"}</h3>
          {booking.vehicleType && <p className={styles.vehicleMeta}>{booking.vehicleType}</p>}
        </div>
        <span className={styles.statusBadge} style={{ color: status.color, background: status.bg }}>
          {status.label}
        </span>
      </div>

      {/* ── Timeline suivi (location uniquement) ── */}
      {!isTrial && <DeliveryTimeline booking={booking} />}

      {/* ── Bloc livraison GPS ── */}
      {!isTrial && isLivraison && (
        <div className={styles.deliveryBlock}>
          <div className={styles.deliveryHeader}>
            <span className={styles.deliveryIcon}>🚚</span>
            <span className={styles.deliveryLabel}>Livraison à domicile</span>
          </div>
          <div className={styles.deliveryAddress}>
            <p className={styles.deliveryAddressText}>
              {booking.pickupAddress || booking.pickupLocation || "Adresse à confirmer par le partenaire"}
            </p>
            {hasGps && (
              <p className={styles.deliveryCoords}>
                📍 GPS : {Number(booking.pickupLat).toFixed(5)}, {Number(booking.pickupLng).toFixed(5)}
              </p>
            )}
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
              🗺️ Voir sur Maps
            </a>
          )}
          {booking.status === "in_progress" && (
            <div className={styles.enRouteAlert}>
              <span>🚗</span>
              <span>Le partenaire est en route vers vous !</span>
            </div>
          )}
        </div>
      )}

      {/* ── Détails ── */}
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
            {booking.pickupMethod && !isLivraison && (
              <DetailRow
                icon="📍"
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

      {/* ── Actions ── */}
      <div className={styles.cardActions}>
        {booking.vehicleId && (
          <Link to={`/vehicle/${booking.vehicleId}`} className={styles.btnSecondary}>
            Voir le véhicule
          </Link>
        )}
        {/* Lien vers le contrat (disponible après acceptation) */}
        {(booking.status === "confirmed" || booking.status === "preparing" || booking.status === "ready" || booking.status === "in_progress" || booking.status === "completed") && booking.id && (
          <Link to={`/contract/${booking.id}`} className={styles.btnContract}>
            📄 Mon contrat
          </Link>
        )}
        {isActive && booking.partnerPhone && (
          <a href={`tel:${booking.partnerPhone}`} className={styles.btnContact}>
            📞 Appeler le partenaire
          </a>
        )}
        {isCompleted && booking.vehicleId && (
          <button className={styles.btnReview} onClick={() => onReview(booking)}>
            ⭐ Laisser un avis
          </button>
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
