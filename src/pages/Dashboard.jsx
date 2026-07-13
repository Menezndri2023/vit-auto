import { useMemo, useState, useEffect, useCallback } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import { useI18n } from "../context/I18nContext";
import { useChat } from "../context/ChatContext";
import styles from "./Dashboard.module.css";

// Transforme une réservation brute du backend en objet plat utilisable par les composants
const normalizeBooking = (b) => {
  const veh = b.vehicle;
  const drv = b.driver;
  return {
    id:            b._id?.toString() || b.id,
    _id:           b._id?.toString() || b.id,
    createdAt:     b.createdAt,
    updatedAt:     b.updatedAt,
    status:        b.status || "pending",
    type:          b.type,
    reference:     b.reference,
    vehicleName:   veh
      ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ")
      : (drv ? `${drv.firstName || ""} ${drv.lastName || ""}`.trim() : "Véhicule"),
    vehicleId:     veh?._id?.toString() || (typeof veh === "string" ? veh : null),
    vehicleType:   veh?.vehicleType || veh?.type || null,
    vehicleMode:   veh?.type === "vente" ? "Acheter" : (veh?.type || null),
    // Infos client
    firstName:     b.clientInfo?.firstName,
    lastName:      b.clientInfo?.lastName,
    email:         b.clientInfo?.email,
    phone:         b.clientInfo?.phone,
    clientInfo:    b.clientInfo,
    clientVerification: b.clientVerification,
    // Dates location
    startDate:     b.location?.startDate,
    endDate:       b.location?.endDate,
    days:          b.location?.days,
    pickupMethod:  b.location?.pickupMethod || "retrait",
    pickupLocation: b.location?.pickupLocation,
    pickupAddress: b.location?.pickupLocation,
    pickupLat:     b.location?.pickupPosition?.lat ?? null,
    pickupLng:     b.location?.pickupPosition?.lng ?? null,
    selectedOptions: b.location?.options || {},
    location:      b.location,
    // Essai
    preferredDate: b.essai?.preferredDate,
    preferredTime: b.essai?.preferredTime,
    notes:         b.essai?.notes || b.chauffeur?.notes,
    // Chauffeur
    chauffeurDate:        b.chauffeur?.date,
    chauffeurHeures:      b.chauffeur?.heures,
    chauffeurLieuDepart:  b.chauffeur?.lieuDepart,
    chauffeurDestination: b.chauffeur?.destination,
    // Leasing
    leasingApportInitial: b.leasing?.apportInitial,
    leasingMensualite:    b.leasing?.mensualite,
    leasingDuree:         b.leasing?.duree,
    // Finances
    total:         b.montantTotal,
    montantTotal:  b.montantTotal,
    baseTotal:     b.montantBase,
    optionsTotal:  b.montantOptions,
    serviceFeeFCFA: b.serviceFeeFCFA ?? 0,
    pricePerDay:   veh?.pricePerDay,
    // Paiement
    paidWith:      b.payment?.method,
    isPaid:        b.isPaid,
    paidAt:        b.paidAt,
    transaction:   b.transaction,
    clientValidation: b.clientValidation,
    devise:        b.devise || "XOF",
    // Partenaire
    partnerPhone:  veh?.contactTel || drv?.phone || null,
    partnerName:   veh?.contactNom || (drv ? `${drv.firstName} ${drv.lastName}` : null),
    // Contrat
    contract:      b.contract?._id || b.contract,
    // Annulation
    cancelReason:  b.cancelReason,
    cancelledAt:   b.cancelledAt,
    _fromBackend:  true,
  };
};

const STATUS_CONFIG = {
  "À confirmer":             { label: "En attente",          color: "#f59e0b", bg: "#fffbeb" },
  pending:                   { label: "En attente",          color: "#f59e0b", bg: "#fffbeb" },
  confirmed:                 { label: "Acceptée",            color: "#10b981", bg: "#ecfdf5" },
  preparing:                 { label: "En cours",            color: "#06b6d4", bg: "#ecfeff" },
  ready:                     { label: "Prêt !",              color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:               { label: "En route",            color: "#3b82f6", bg: "#eff6ff" },
  client_arrived:            { label: "Rendez-vous confirmé",color: "#0ea5e9", bg: "#e0f2fe" },
  client_absent:             { label: "Absence signalée",    color: "#dc2626", bg: "#fef2f2" },
  transaction_concluded:     { label: "Transaction conclue", color: "#16a34a", bg: "#dcfce7" },
  transaction_not_concluded: { label: "Non conclue",         color: "#9ca3af", bg: "#f3f4f6" },
  waiting_client_validation: { label: "Validation requise",  color: "#d97706", bg: "#fef3c7" },
  completed:                 { label: "Terminée",            color: "#64748b", bg: "#f8fafc" },
  cancelled:                 { label: "Annulée",             color: "#ef4444", bg: "#fef2f2" },
  disputed:                  { label: "Litige ouvert",       color: "#dc2626", bg: "#fef2f2" },
};

const PICKUP_LABELS = {
  livraison: "Livraison à domicile",
  retrait:   "Retrait chez le vendeur",
};

const PAYMENT_LABELS = {
  orange:       "Orange Money",
  wave:         "Wave",
  mtn:          "MTN Mobile Money",
  moov:         "Moov Money",
  card:         "Carte bancaire",
  cash:         "Espèces",
  paypal:       "PayPal",
  virement:     "Virement bancaire",
  orange_money: "Orange Money",
  test:         "Paiement de test",
};

const OPTIONS_LABELS = {
  gps:       "GPS intégré",
  babySeat:  "Siège bébé",
  insurance: "Assurance",
  driver:    "Chauffeur privé",
};

// ── Étapes de suivi de livraison — workflow complet client (8 étapes) ─────────
const TRACKING_STEPS = [
  { key: "pending",                  label: "Reçue",       icon: "📋", desc: "Votre demande a été envoyée au partenaire" },
  { key: "confirmed",                label: "Acceptée",    icon: "✅", desc: "Le partenaire a accepté votre réservation" },
  { key: "preparing",                label: "Préparation", icon: "⚙️", desc: "Le partenaire prépare votre véhicule" },
  { key: "ready",                    label: "Prêt",        icon: "🚗", desc: "Votre véhicule est prêt pour la livraison" },
  { key: "in_progress",              label: "En route",    icon: "🚀", desc: "Le partenaire est en route vers vous" },
  { key: "client_arrived",           label: "Arrivée",     icon: "📍", desc: "Votre présence a été confirmée au point de remise" },
  { key: "waiting_client_validation",label: "Validation",  icon: "✋", desc: "Confirmez la transaction enregistrée par le partenaire" },
  { key: "completed",                label: "Terminée",    icon: "🏁", desc: "Location terminée — merci !" },
];

const STEP_ORDER_CLIENT = [
  "pending", "confirmed", "preparing", "ready",
  "in_progress", "client_arrived", "waiting_client_validation", "completed",
];

function getStepIndex(status) {
  const idx = STEP_ORDER_CLIENT.indexOf(status);
  if (idx !== -1) return idx;
  if (status === "À confirmer")            return 0; // = pending
  if (status === "transaction_concluded")  return 7; // après validation → completed
  if (status === "client_absent")          return 4; // resté sur in_progress
  if (status === "transaction_not_concluded") return 5; // client_arrived mais transaction échouée
  if (status === "compensated")            return 7; // résolu avec compensation
  return 0;
}

// ── Timeline suivi ────────────────────────────────────────────────────────────
function DeliveryTimeline({ booking, onValidate, onDispute, validating }) {
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
      {/* Description étape courante — une seule alerte contextuelle selon le statut */}
      {booking.status === "pending" || booking.status === "À confirmer" ? (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>📋</span>
          <span>Demande envoyée — en attente de confirmation du partenaire.</span>
        </div>
      ) : booking.status === "confirmed" ? (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>✅</span>
          <span>Réservation acceptée ! Le partenaire prépare votre véhicule.</span>
        </div>
      ) : booking.status === "preparing" ? (
        <div className={styles.timelineStatusMsg}>
          <span className={styles.timelineStatusIcon}>⚙️</span>
          <span>Votre véhicule est en cours de préparation.</span>
        </div>
      ) : booking.status === "ready" ? (
        <div className={styles.readyAlert}>
          <span>🎉</span>
          <span>Votre véhicule est prêt ! Le partenaire va vous contacter pour la livraison.</span>
        </div>
      ) : booking.status === "in_progress" ? (
        <div className={styles.enRouteAlertClient}>
          <span>🚀</span>
          <span>Le partenaire est en route vers vous. Préparez votre pièce d'identité.</span>
        </div>
      ) : booking.status === "client_arrived" ? (
        <div className={styles.timelineStatusMsg} style={{ background: "#e0f2fe", borderLeft: "3px solid #0ea5e9" }}>
          <span className={styles.timelineStatusIcon}>📍</span>
          <span>Votre présence a été confirmée. Le partenaire enregistre la transaction.</span>
        </div>
      ) : booking.status === "transaction_concluded" ? (
        <div className={styles.timelineStatusMsg} style={{ background: "#fef3c7", borderLeft: "3px solid #f59e0b" }}>
          <span className={styles.timelineStatusIcon}>💰</span>
          <span>Transaction enregistrée par le partenaire — votre validation est requise.</span>
        </div>
      ) : booking.status === "client_absent" ? (
        <div className={styles.timelineStatusMsg} style={{ background: "#fef2f2", borderLeft: "3px solid #f87171" }}>
          <span className={styles.timelineStatusIcon}>🚫</span>
          <span>Absence enregistrée. Contactez le partenaire pour reprogrammer.</span>
        </div>
      ) : null}
      {booking.status === "waiting_client_validation" && onValidate && (
        <div className={styles.validationAlert}>
          <div className={styles.validationAlertHeader}>
            <span>✋</span>
            <strong>Validation requise</strong>
          </div>
          <div className={styles.validationDetails}>
            <p>Le partenaire a enregistré la transaction suivante :</p>
            {booking.transaction?.finalAmount && (
              <div className={styles.txSummary}>
                <div className={styles.txSummaryRow}>
                  <span>Montant</span>
                  <strong>{Number(booking.transaction.finalAmount).toLocaleString("fr-FR")} {booking.devise || "XOF"}</strong>
                </div>
                <div className={styles.txSummaryRow}>
                  <span>Mode de paiement</span>
                  <strong>{booking.transaction?.paymentMethod === "cash" ? "💵 Espèces" : booking.transaction?.paymentMethod || "—"}</strong>
                </div>
                {booking.transaction?.comment && (
                  <div className={styles.txSummaryRow}>
                    <span>Note partenaire</span>
                    <strong>{booking.transaction.comment}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.validationActions}>
            <button className={styles.btnValidate} onClick={() => onValidate("validate")} disabled={validating}>
              {validating ? "⏳ En cours…" : "✅ Valider — Service effectué"}
            </button>
            <button className={styles.btnDispute} onClick={onDispute} disabled={validating}>
              ⚠️ Signaler un problème
            </button>
          </div>
        </div>
      )}
      {booking.status === "disputed" && (
        <div className={styles.disputedAlert}>
          <span>⚠️</span>
          <span>Litige signalé. Notre équipe vous contactera sous 48h.</span>
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
  const { removeBooking } = useVehicles();
  const { success: toastSuccess, error: toastError } = useToast();
  const { fmt } = useCurrency();
  const { on } = useSocket();
  const { t } = useI18n();

  // ── État local — Dashboard est autonome, ne dépend pas de VehicleContext.bookings ──
  const [myOrders,    setMyOrders]    = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [activeTab,   setActiveTab]   = useState("all");
  const [reviewTarget,  setReviewTarget]  = useState(null);
  const [refreshing,    setRefreshing]    = useState(false);
  const [disputeTarget, setDisputeTarget] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [validating,    setValidating]    = useState(null);

  // ── Fetch direct /api/bookings/mine — source de vérité ───────────────────
  const fetchMyOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/bookings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) {
        setMyOrders(raw.map(normalizeBooking));
      }
    } catch { /* backend indisponible — conserver l'affichage existant */ }
    finally { setLoadingOrders(false); }
  }, [token]);

  const handleReviewSuccess = useCallback(() => {
    toastSuccess("Merci pour votre avis !");
  }, [toastSuccess]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMyOrders();
    setRefreshing(false);
    toastSuccess("Réservations actualisées");
  }, [fetchMyOrders, toastSuccess]);

  const handleValidate = useCallback(async (bookingId, action, reason) => {
    if (!token || !bookingId) return;
    setValidating(bookingId);
    try {
      const r = await fetch(`/api/bookings/${bookingId}/validate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, disputeReason: reason }),
      });
      const d = await r.json();
      if (r.ok) {
        if (action === "validate") {
          toastSuccess("✅ Transaction validée. Merci !");
        } else {
          toastSuccess("⚠️ Litige enregistré. Notre équipe vous contactera sous 48h.");
          setDisputeTarget(null);
          setDisputeReason("");
        }
        await fetchMyOrders(); // Re-fetch pour avoir le statut à jour
      } else {
        toastError(d.message || "Erreur lors de la validation.");
      }
    } catch { toastError("Erreur réseau."); }
    finally { setValidating(null); }
  }, [token, fetchMyOrders, toastSuccess, toastError]);

  // ── Temps réel : Socket.io + polling de secours (60s) ─────────────────────
  useEffect(() => {
    if (!token) return;
    fetchMyOrders();

    // Mise à jour instantanée sur événement Socket.io
    const handleBookingUpdate = (payload) => {
      fetchMyOrders(); // re-fetch complet pour avoir les données à jour
      const label = payload.status === "confirmed"   ? "✅ Votre réservation a été acceptée !"
                  : payload.status === "cancelled"   ? "❌ Votre réservation a été annulée."
                  : payload.status === "preparing"   ? "⚙️ Votre véhicule est en préparation…"
                  : payload.status === "ready"       ? "🚗 Votre véhicule est prêt !"
                  : payload.status === "in_progress" ? "🚀 Le partenaire est en route !"
                  : payload.status === "waiting_client_validation" ? "✋ Validez votre transaction !"
                  : payload.status === "completed"   ? "🏁 Commande terminée. Merci !"
                  : null;
      if (label) toastSuccess(label);
    };

    const cleanup = on("booking_updated", handleBookingUpdate);

    // Polling de secours toutes les 60s (en cas de coupure socket)
    const iv = setInterval(() => fetchMyOrders(), 60000);

    return () => {
      cleanup();
      clearInterval(iv);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);  // fetchMyOrders intentionnellement exclu pour éviter la boucle

  const now = new Date();

  // Ces useMemo doivent être AVANT les early returns (règles des hooks React)
  // Statuts nécessitant une action client urgente → toujours dans "En cours"
  const ACTION_REQUIRED = new Set([
    "waiting_client_validation",
    "transaction_concluded",
    "disputed",
    "client_absent",
  ]);

  // myOrders = source directe du backend, déjà filtrée par /api/bookings/mine
  // pas besoin de re-filtrer par email ou _fromBackend

  const activeBookings = useMemo(
    () => myOrders.filter((b) => {
      if (b.status === "cancelled" || b.status === "completed") return false;
      // Statuts nécessitant une action client → TOUJOURS dans l'onglet actif
      if (ACTION_REQUIRED.has(b.status)) return true;
      if (b.type === "essai") return true;
      const end = new Date(b.endDate || b.location?.endDate);
      return isNaN(end.getTime()) || end >= now;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myOrders]
  );

  const doneBookings = useMemo(
    () => myOrders.filter((b) => {
      if (ACTION_REQUIRED.has(b.status)) return false;
      return b.status === "completed" || b.status === "cancelled" ||
        (b.type !== "essai" && !isNaN(new Date(b.endDate || b.location?.endDate).getTime()) && new Date(b.endDate || b.location?.endDate) < now);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myOrders]
  );

  const totalSpent = useMemo(
    () => myOrders.reduce((s, b) => s + (b.total || b.montantTotal || 0), 0),
    [myOrders]
  );

  const location = useLocation();

  // ── Guard : non connecté → redirection /login avec state.from ──
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isPartner = user?.role === "partenaire" || user?.role === "admin";

  // Partenaires → redirection vers leur espace dédié
  if (isPartner) {
    return (
      <div className={styles.page}>
        <div className={styles.guardCard}>
          <div className={styles.guardIcon}>🤝</div>
          <h2>Espace Partenaire</h2>
          <p>Gérez vos commandes et réservations personnelles depuis votre espace partenaire.</p>
          <Link to="/vendor/dashboard" className={styles.primaryBtn}>Mon espace partenaire →</Link>
        </div>
      </div>
    );
  }

  const displayed = activeTab === "active" ? activeBookings
    : activeTab === "done"   ? doneBookings
    : myOrders;

  // Bookings nécessitant une validation client urgente
  const pendingValidation = myOrders.filter((b) => b.status === "waiting_client_validation");

  return (
    <div className={styles.page}>

      {/* ── Alerte validation urgente ── */}
      {pendingValidation.length > 0 && (
        <div style={{
          background: "#fffbeb", border: "2px solid #f59e0b",
          borderRadius: 14, padding: "16px 24px", margin: "16px 0 0",
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <span style={{ fontSize: "1.8rem", flexShrink: 0 }}>✋</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 800, color: "#92400e", fontSize: "1rem" }}>
              Action requise — Validation de transaction
            </p>
            <p style={{ margin: "0 0 10px", fontSize: "0.88rem", color: "#78350f" }}>
              {pendingValidation.length === 1
                ? `Le partenaire a enregistré votre transaction. Validez-la dans l'onglet "En cours" ci-dessous.`
                : `${pendingValidation.length} transactions à valider. Rendez-vous dans l'onglet "En cours".`}
            </p>
            <button
              onClick={() => setActiveTab("active")}
              style={{ background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontWeight:700, fontSize:"0.85rem", cursor:"pointer" }}>
              Voir et valider →
            </button>
          </div>
        </div>
      )}

      {/* ── En-tête ── */}
      <header className={styles.header}>
        <div>
          <h1>{t("dash.title")}</h1>
          <p className={styles.welcome}>
            {t("dash.welcome")} <strong>{user?.firstName || user?.name || user?.email}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={styles.refreshBtn || ""}
            style={{
              background: "transparent",
              border: "2px solid rgba(255,255,255,0.3)",
              color: "#fff",
              borderRadius: "8px",
              padding: "0.5rem 1rem",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
            {refreshing ? "…" : "↻"}
          </button>
          <Link to="/catalogue" className={styles.ctaBtn}>
            + {t("dash.book")}
          </Link>
        </div>
      </header>

      {/* ── Statistiques ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📋</span>
          <span className={styles.statNumber}>{myOrders.length}</span>
          <span className={styles.statLabel}>{t("dash.total")} {t("dash.myBookings")}</span>
        </div>
        <div className={`${styles.statCard} ${styles.statBlue}`}>
          <span className={styles.statIcon}>🚗</span>
          <span className={styles.statNumber}>{activeBookings.length}</span>
          <span className={styles.statLabel}>{t("dash.status.active")}</span>
        </div>
        <div className={`${styles.statCard} ${styles.statGreen}`}>
          <span className={styles.statIcon}>✅</span>
          <span className={styles.statNumber}>{doneBookings.length}</span>
          <span className={styles.statLabel}>{t("dash.status.completed")}</span>
        </div>
        <div className={`${styles.statCard} ${styles.statRed}`}>
          <span className={styles.statIcon}>💰</span>
          <span className={`${styles.statNumber} ${styles.statNumberSm}`}>{fmt(totalSpent)}</span>
          <span className={styles.statLabel}>{t("dash.spend")}</span>
        </div>
      </div>

      {/* ── Onglets ── */}
      <div className={styles.tabs}>
        {[
          { key: "all",    label: t("dash.myBookings"),                        count: myOrders.length     },
          { key: "active", label: t("dash.status.active"),                     count: activeBookings.length },
          { key: "done",   label: `${t("dash.status.completed")} / ${t("dash.status.cancelled")}`, count: doneBookings.length },
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
      {loadingOrders ? (
        <div className={styles.loadingBox || ""} style={{ textAlign:"center", padding:"4rem 1rem", color:"#64748b" }}>
          <div className={styles.spinner || ""} style={{ margin:"0 auto 1rem" }} />
          <p>{t("dash.loading")}</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>📭</div>
          <h3>{t("dash.noBookings")}</h3>
          <p>
            {activeTab === "active"
              ? t("dash.noBookings")
              : activeTab === "done"
              ? t("dash.noBookings")
              : t("dash.noBookings")}
          </p>
          <Link to="/catalogue" className={styles.primaryBtn}>{t("vehicle.details")}</Link>
        </div>
      ) : (
        <div className={styles.bookingList}>
          {displayed.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancel={(id) => removeBooking(id, "Annulé par le client")}
              onReview={setReviewTarget}
              onValidate={(action) => handleValidate(booking.id, action)}
              onDispute={() => setDisputeTarget(booking.id)}
              validating={validating === booking.id}
            />
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

      {/* ── Modal litige ── */}
      {disputeTarget && (
        <div className={styles.modalOverlay} onClick={() => setDisputeTarget(null)}>
          <div className={styles.reviewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.reviewHeader}>
              <h3>⚠️ Signaler un problème</h3>
              <button className={styles.closeBtn} onClick={() => setDisputeTarget(null)}>✕</button>
            </div>
            <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "1rem" }}>
              Décrivez le problème rencontré. Notre équipe vous contactera sous 48h.
            </p>
            <textarea
              className={styles.reviewTextarea}
              rows={4}
              placeholder="Ex : Le montant ne correspond pas, service non effectué, véhicule différent..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div className={styles.reviewActions}>
              <button
                style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "0.75rem 1.5rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                onClick={() => handleValidate(disputeTarget, "dispute", disputeReason)}
                disabled={!disputeReason.trim() || validating}
              >
                {validating ? "Envoi…" : "Confirmer le litige"}
              </button>
              <button className={styles.btnGhost} onClick={() => { setDisputeTarget(null); setDisputeReason(""); }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Carte de réservation ──────────────────────────────────────────────────────
const BookingCard = ({ booking, onCancel, onReview, onValidate, onDispute, validating }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { fmt } = useCurrency();
  const { openOrCreateChat } = useChat();
  const { error: toastErr } = useToast();
  const [contacting, setContacting] = useState(false);

  const handleContactPartner = async () => {
    if (contacting) return;
    setContacting(true);
    const res = await openOrCreateChat("client_partner", null, booking.id);
    if (!res.ok) toastErr(res.message || "Impossible d'ouvrir la conversation.");
    setContacting(false);
  };

  const status         = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const canCancel      = ["À confirmer", "pending", "confirmed"].includes(booking.status) || !booking.status;
  const isCompleted    = booking.status === "completed";
  const isActive       = ["confirmed", "preparing", "ready", "in_progress", "client_arrived"].includes(booking.status);
  const isTrial        = booking.type === "essai";
  const isChauffeur    = booking.type === "chauffeur";
  const isLeasing      = booking.type === "leasing";
  const TYPE_TAG = { essai: "🔑 Essai", chauffeur: "🧑‍✈️ Chauffeur", leasing: "📊 Leasing", location: "🚗 Location" };
  const needsValidation = booking.status === "waiting_client_validation" || booking.status === "transaction_concluded";
  const isEnRoute      = booking.status === "in_progress";

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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className={styles.bookingTypeTag}>
              {TYPE_TAG[booking.type] || TYPE_TAG.location}
            </span>
            {needsValidation && (
              <span className={styles.actionRequiredBadge}>✋ Validation requise</span>
            )}
            {isEnRoute && (
              <span className={styles.enRouteBadge}>🚀 En route</span>
            )}
          </div>
          <h3 className={styles.vehicleName}>{booking.vehicleName || "Véhicule"}</h3>
          {booking.vehicleType && <p className={styles.vehicleMeta}>{booking.vehicleType}</p>}
        </div>
        <span className={styles.statusBadge} style={{ color: status.color, background: status.bg }}>
          {status.label}
        </span>
      </div>

      {/* ── Timeline suivi (tous types — indispensable pour valider/contester la transaction) ── */}
      <DeliveryTimeline booking={booking} onValidate={onValidate} onDispute={onDispute} validating={validating} />

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
        ) : isChauffeur ? (
          <>
            {booking.chauffeurDate && (
              <DetailRow icon="📅" label="Date" value={new Date(booking.chauffeurDate).toLocaleDateString("fr-FR")} />
            )}
            {booking.chauffeurHeures && <DetailRow icon="⏱️" label="Durée" value={`${booking.chauffeurHeures} h`} />}
            {booking.chauffeurLieuDepart && <DetailRow icon="📍" label="Départ" value={booking.chauffeurLieuDepart} />}
            {booking.chauffeurDestination && <DetailRow icon="🏁" label="Destination" value={booking.chauffeurDestination} />}
            {booking.notes && <DetailRow icon="💬" label="Message" value={booking.notes} />}
          </>
        ) : isLeasing ? (
          <>
            {booking.leasingApportInitial != null && <DetailRow icon="💰" label="Apport initial" value={fmt(booking.leasingApportInitial)} />}
            {booking.leasingMensualite != null && <DetailRow icon="📆" label="Mensualité" value={fmt(booking.leasingMensualite)} />}
            {booking.leasingDuree && <DetailRow icon="🗓️" label="Durée" value={`${booking.leasingDuree} mois`} />}
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
        {booking.type === "location" && booking.baseTotal > 0 && (
          <div className={styles.finRow}>
            <span>Location ({booking.days}j × {fmt(booking.pricePerDay)})</span>
            <span>{fmt(booking.baseTotal)}</span>
          </div>
        )}
        {isChauffeur && booking.baseTotal > 0 && (
          <div className={styles.finRow}>
            <span>Prestation chauffeur ({booking.chauffeurHeures || 0} h)</span>
            <span>{fmt(booking.baseTotal)}</span>
          </div>
        )}
        {booking.type === "location" && booking.optionsTotal > 0 && (
          <div className={styles.finRow}>
            <span>Options</span>
            <span>{fmt(booking.optionsTotal)}</span>
          </div>
        )}
        {booking.type === "location" && booking.deliveryFee > 0 && (
          <div className={styles.finRow}>
            <span>Livraison</span>
            <span>{fmt(booking.deliveryFee)}</span>
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
        {booking.type === "location" && booking.cautionAmount > 0 && (
          <div className={styles.finRow} style={{ color: "#d97706" }}>
            <span>Caution à prévoir sur place</span>
            <span>{fmt(booking.cautionAmount)}</span>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className={styles.cardActions}>
        {booking.vehicleId && (
          <Link to={`/vehicle/${booking.vehicleId}`} className={styles.btnSecondary}>
            Voir le véhicule
          </Link>
        )}
        {/* Contrat + reçu PDF (disponible après acceptation) */}
        {(booking.status === "confirmed" || booking.status === "preparing" || booking.status === "ready" || booking.status === "in_progress" || booking.status === "completed") && booking.id && (
          <>
            <Link to={`/contract/${booking.id}`} className={styles.btnContract}>
              📄 Mon contrat
            </Link>
            <a href={`/api/contracts/${booking.id}/pdf`} target="_blank" rel="noopener noreferrer" className={styles.btnContract} style={{ background: "transparent", border: "1.5px solid currentColor" }}>
              ⬇️ PDF
            </a>
          </>
        )}
        {booking.status === "completed" && booking.id && (
          <a href={`/api/bookings/${booking.id}/receipt`} target="_blank" rel="noopener noreferrer" className={styles.btnContact}>
            🧾 Reçu
          </a>
        )}
        {isActive && booking.partnerPhone && (
          <a href={`tel:${booking.partnerPhone}`} className={styles.btnContact}>
            📞 Appeler le partenaire
          </a>
        )}
        {isActive && booking.id && (
          <button className={styles.btnContact} onClick={handleContactPartner} disabled={contacting}>
            💬 {contacting ? "Ouverture…" : "Message au partenaire"}
          </button>
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
