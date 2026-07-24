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

// Cohérent avec FINANCING_DECISION_CFG (AdminPanel.jsx) — la décision admin sur
// une demande leasing/crédit n'était jusqu'ici visible que via une notification
// ponctuelle, jamais affichée durablement sur la carte de réservation elle-même.
const FINANCING_DECISION_CFG = {
  en_etude: { label: "🔍 En étude", color: "#d97706" },
  accepte:  { label: "✅ Accepté",  color: "#10b981" },
  refuse:   { label: "❌ Refusé",   color: "#dc2626" },
};

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
    // Réservation chauffeur — cible d'avis distincte du véhicule (voir Review.targetType).
    driverId:      drv?._id?.toString() || (typeof drv === "string" ? drv : null),
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
    // Leasing / Crédit classique
    leasingApportInitial: b.leasing?.apportInitial,
    leasingMensualite:    b.leasing?.mensualite,
    leasingDuree:         b.leasing?.duree,
    financingType:        b.leasing?.financingType,
    financingDecision:    b.leasing?.decision,
    financingDecisionNote: b.leasing?.decisionNote,
    financingDecisionAt:  b.leasing?.decisionAt,
    financingTauxInteret: b.leasing?.tauxInteret,
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
    devise:        b.devise || "USD",
    // Partenaire
    partnerPhone:  veh?.contactTel || drv?.phone || null,
    partnerName:   veh?.contactNom || (drv ? `${drv.firstName} ${drv.lastName}` : null),
    // Contrat
    contract:      b.contract?._id || b.contract,
    // Annulation
    cancelReason:  b.cancelReason,
    cancelledAt:   b.cancelledAt,
    hasReview:     !!b.review,
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
  driver_arrived:            { label: "Chauffeur arrivé",    color: "#0ea5e9", bg: "#e0f2fe" },
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
  const { fmt } = useCurrency();
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
                  <strong>{fmt(booking.transaction.finalAmount)}</strong>
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
  const { error: toastErr } = useToast();

  // Réservation chauffeur (booking.driverId) vs véhicule — targetType/targetId
  // doivent correspondre à la ressource réellement réservée (voir reviewController.
  // createReview, qui accepte déjà pleinement targetType "driver" côté backend ;
  // ce composant l'envoyait jusqu'ici toujours en dur en "vehicle", ce qui
  // empêchait silencieusement tout avis sur une mission chauffeur terminée).
  const isDriverBooking = !booking.vehicleId && !!booking.driverId;
  const targetType = isDriverBooking ? "driver" : "vehicle";
  const targetId   = isDriverBooking ? booking.driverId : booking.vehicleId;

  const submit = async () => {
    if (!token || !targetId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: booking.id,
          targetType,
          targetId,
          note,
          commentaire,
        }),
      });
      if (res.ok) { onSuccess(); onClose(); }
      else {
        const data = await res.json().catch(() => ({}));
        toastErr(data.message || "Impossible d'envoyer l'avis.");
      }
    } catch { toastErr("Erreur réseau, réessayez."); }
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
          placeholder={isDriverBooking ? "Partagez votre expérience avec ce chauffeur..." : "Partagez votre expérience avec ce véhicule..."}
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
  const [employmentRequests, setEmploymentRequests] = useState([]);
  const [employmentCanceling, setEmploymentCanceling] = useState(null);

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
    fetchMyOrders();
  }, [toastSuccess, fetchMyOrders]);

  // ── Mes propositions d'embauche CDD/CDI (voir DriverEmployment.jsx) ────────
  const fetchEmploymentRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/driver-employment/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const { requests } = await res.json();
      if (Array.isArray(requests)) setEmploymentRequests(requests);
    } catch { /* ignore */ }
  }, [token]);

  const cancelEmploymentRequest = useCallback(async (id) => {
    if (!token) return;
    setEmploymentCanceling(id);
    try {
      const res = await fetch(`/api/driver-employment/${id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toastSuccess("Proposition annulée."); fetchEmploymentRequests(); }
      else { const d = await res.json().catch(() => ({})); toastError(d.message || "Erreur lors de l'annulation."); }
    } catch { toastError("Erreur réseau."); }
    finally { setEmploymentCanceling(null); }
  }, [token, toastSuccess, toastError, fetchEmploymentRequests]);

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

  // ── Mission chauffeur : le client confirme l'arrivée puis clôt la mission ──
  // (voir bookingController.markDriverArrived/completeMission — ces deux étapes
  // sont pilotées par le client, contrairement au reste du pipeline).
  const handleMissionAction = useCallback(async (bookingId, action) => {
    if (!token || !bookingId) return;
    setValidating(bookingId);
    try {
      const endpoint = action === "arrived" ? "driver-arrived" : "complete-mission";
      const r = await fetch(`/api/bookings/${bookingId}/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toastSuccess(action === "arrived" ? "📍 Arrivée du chauffeur confirmée." : "🏁 Mission terminée. Merci !");
        await fetchMyOrders();
      } else {
        toastError(d.message || "Erreur lors de la mise à jour.");
      }
    } catch { toastError("Erreur réseau."); }
    finally { setValidating(null); }
  }, [token, fetchMyOrders, toastSuccess, toastError]);

  // ── Temps réel : Socket.io + polling de secours (60s) ─────────────────────
  useEffect(() => {
    if (!token) return;
    fetchMyOrders();
    fetchEmploymentRequests();

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
              border: "2px solid #d8dfef",
              color: "#0f1b3f",
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
            {refreshing ? "…" : null}
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
              onMissionAction={(action) => handleMissionAction(booking.id, action)}
              validating={validating === booking.id}
            />
          ))}
        </div>
      )}

      {/* ── Mes propositions d'embauche CDD/CDI (voir DriverEmployment.jsx) ── */}
      {employmentRequests.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f1b3f", marginBottom: 12 }}>
            💼 Mes propositions d'embauche
          </h2>
          <div className={styles.bookingList}>
            {employmentRequests.map((reqm) => {
              const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, accepted: { l: "Acceptée", c: "#059669", bg: "#d1fae5" }, declined: { l: "Refusée", c: "#dc2626", bg: "#fee2e2" }, cancelled: { l: "Annulée", c: "#64748b", bg: "#f1f5f9" } }[reqm.status];
              return (
                <div key={reqm._id} className={styles.bookingCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ color: "#0f1b3f" }}>{reqm.contractType?.toUpperCase()} — {reqm.driver?.firstName} {reqm.driver?.lastName}</strong>
                      <p style={{ margin: "4px 0", color: "#64748b", fontSize: "0.85rem" }}>{fmt(reqm.proposedSalary)} / mois</p>
                      <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>
                        Début : {reqm.startDate ? new Date(reqm.startDate).toLocaleDateString("fr-FR") : "—"}
                        {reqm.endDate && ` · Fin : ${new Date(reqm.endDate).toLocaleDateString("fr-FR")}`}
                      </p>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, color: sc.c, background: sc.bg }}>{sc.l}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {reqm.status === "accepted" && (
                      <a href={`/api/driver-employment/${reqm._id}/contract-pdf`} target="_blank" rel="noopener noreferrer" className={styles.btnContract}>
                        ⬇️ Récapitulatif PDF
                      </a>
                    )}
                    {reqm.status === "pending" && (
                      <button className={styles.btnDangerSm} disabled={employmentCanceling === reqm._id}
                        onClick={() => cancelEmploymentRequest(reqm._id)}>
                        {employmentCanceling === reqm._id ? "…" : "Annuler"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
const ONLINE_PAY_METHODS = ["card", "orange_money", "wave"];

const BookingCard = ({ booking, onCancel, onReview, onValidate, onDispute, onMissionAction, validating }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { fmt } = useCurrency();
  const { openOrCreateChat } = useChat();
  const { error: toastErr, success: toastSuccessModify } = useToast();
  const { token } = useAuth();
  const [contacting, setContacting] = useState(false);
  const [payingNow, setPayingNow] = useState(false);

  // ── Modification des dates (location uniquement) ──────────────────────────
  // Jusqu'ici seule l'annulation était possible — un client devait tout annuler
  // puis recommencer une nouvelle réservation pour changer ses dates.
  const [showModify, setShowModify] = useState(false);
  const [modifyForm, setModifyForm] = useState({ startDate: "", endDate: "" });
  const [modifying, setModifying] = useState(false);
  const [modifyError, setModifyError] = useState(null);

  const handleModifyDates = async () => {
    if (!modifyForm.startDate || !modifyForm.endDate) return;
    setModifying(true);
    setModifyError(null);
    try {
      const r = await fetch(`/api/bookings/${booking.id}/modify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(modifyForm),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccessModify("Dates modifiées avec succès.");
        setShowModify(false);
        window.location.reload();
      } else setModifyError(d.message || "Erreur lors de la modification.");
    } catch { setModifyError("Erreur réseau."); }
    setModifying(false);
  };

  const handleContactPartner = async () => {
    if (contacting) return;
    setContacting(true);
    const res = await openOrCreateChat("client_partner", null, booking.id);
    if (!res.ok) toastErr(res.message || "Impossible d'ouvrir la conversation.");
    setContacting(false);
  };

  // Relance le paiement en ligne d'une réservation déjà enregistrée mais
  // jamais payée (ex: passerelle indisponible à la création — voir
  // BookingSuccess.jsx payment.initFailed) — même route que Booking.jsx.
  const handlePayNow = async () => {
    if (payingNow || !booking.id) return;
    setPayingNow(true);
    try {
      const r = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id, method: booking.paidWith }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
      toastErr(d.message || "Paiement indisponible pour le moment, réessayez plus tard.");
    } catch {
      toastErr("Erreur réseau — réessayez plus tard.");
    } finally {
      setPayingNow(false);
    }
  };

  const status         = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const canCancel      = ["À confirmer", "pending", "confirmed"].includes(booking.status) || !booking.status;
  const isCompleted    = booking.status === "completed";
  const isActive       = ["confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived"].includes(booking.status);
  // Mission chauffeur pilotée par le client : "confirmer l'arrivée" tant que le
  // partenaire n'a pas encore atteint la destination, puis "terminer la mission"
  // une fois l'arrivée confirmée (voir bookingController.markDriverArrived/completeMission).
  const canMarkDriverArrived = booking.type === "chauffeur" && ["confirmed", "preparing", "in_progress"].includes(booking.status);
  const canCompleteMission   = booking.type === "chauffeur" && booking.status === "driver_arrived";
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
            <DetailRow icon="🏦" label="Type de financement" value={booking.financingType === "credit" ? "Crédit classique" : "Leasing (LOA)"} />
            {booking.leasingApportInitial != null && <DetailRow icon="💰" label="Apport initial" value={fmt(booking.leasingApportInitial)} />}
            {booking.leasingMensualite != null && <DetailRow icon="📆" label="Mensualité" value={fmt(booking.leasingMensualite)} />}
            {booking.leasingDuree && <DetailRow icon="🗓️" label="Durée" value={`${booking.leasingDuree} mois`} />}
            <DetailRow icon="📋" label="Statut de la demande"
              value={<span style={{ color: FINANCING_DECISION_CFG[booking.financingDecision || "en_etude"].color, fontWeight: 700 }}>
                {FINANCING_DECISION_CFG[booking.financingDecision || "en_etude"].label}
              </span>} />
            {booking.financingDecisionNote && <DetailRow icon="💬" label="Note" value={booking.financingDecisionNote} />}
            {/* Échéancier indicatif — aucun paiement d'échéance n'est réellement suivi
                par la plateforme (réglé directement au partenaire) : ce n'était jusqu'ici
                affiché nulle part, le client ne pouvait pas savoir où il en était. Calculé
                à partir de la date d'acceptation + mensualité, PAS d'un suivi réel des
                versements — présenté comme indicatif pour cette raison. */}
            {booking.financingDecision === "accepte" && booking.financingDecisionAt && booking.leasingDuree && (() => {
              const monthsElapsed = Math.max(0, Math.min(
                booking.leasingDuree,
                Math.floor((Date.now() - new Date(booking.financingDecisionAt)) / (30.44 * 86400000))
              ));
              const remaining = booking.leasingDuree - monthsElapsed;
              const nextDue = new Date(booking.financingDecisionAt);
              nextDue.setMonth(nextDue.getMonth() + monthsElapsed + 1);
              return (
                <>
                  <DetailRow icon="📊" label="Échéancier (indicatif)" value={`Mensualité ${Math.min(monthsElapsed + 1, booking.leasingDuree)} / ${booking.leasingDuree}`} />
                  {remaining > 0 && <DetailRow icon="💵" label="Solde restant estimé" value={fmt((booking.leasingMensualite || 0) * remaining)} />}
                  {remaining > 0 && <DetailRow icon="📅" label="Prochaine échéance estimée" value={nextDue.toLocaleDateString("fr-FR")} />}
                  {remaining <= 0 && <DetailRow icon="✅" label="Échéancier" value="Durée théorique écoulée" />}
                </>
              );
            })()}
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
          <span>{fmt(booking.serviceFeeFCFA || 1)}</span>
        </div>
        <div className={`${styles.finRow} ${styles.finTotal}`}>
          <span>Total réglé</span>
          <strong>{fmt(booking.total || booking.serviceFeeFCFA || 1)}</strong>
        </div>
        {booking.type === "location" && booking.cautionAmount > 0 && !booking.cautionClaim?.claimedAt && (
          <div className={styles.finRow} style={{ color: "#d97706" }}>
            <span>Caution à prévoir sur place</span>
            <span>{fmt(booking.cautionAmount)}</span>
          </div>
        )}
        {booking.type === "location" && booking.cautionClaim?.claimedAt && (
          <div className={styles.finRow} style={{ color: booking.cautionClaim.amountClaimed > 0 ? "#dc2626" : "#059669" }}>
            <span>
              {booking.cautionClaim.amountClaimed > 0
                ? `Caution retenue (${booking.cautionClaim.reason || "voir partenaire"})`
                : "Caution restituée intégralement"}
            </span>
            <span>{fmt(booking.cautionClaim.amountClaimed)}</span>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className={styles.cardActions}>
        {!booking.isPaid && booking.status !== "cancelled" && ONLINE_PAY_METHODS.includes(booking.paidWith) && (
          <button className={styles.btnContract} onClick={handlePayNow} disabled={payingNow}>
            💳 {payingNow ? "Redirection…" : "Payer maintenant"}
          </button>
        )}
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
        {canMarkDriverArrived && (
          <button className={styles.btnContract} onClick={() => onMissionAction("arrived")} disabled={validating}>
            📍 {validating ? "…" : "Confirmer l'arrivée du chauffeur"}
          </button>
        )}
        {canCompleteMission && (
          <button className={styles.btnSubmitReview} onClick={() => onMissionAction("complete")} disabled={validating}>
            🏁 {validating ? "…" : "Terminer la mission"}
          </button>
        )}
        {isCompleted && (booking.vehicleId || booking.driverId) && !booking.hasReview && (
          <button className={styles.btnReview} onClick={() => onReview(booking)}>
            ⭐ Laisser un avis
          </button>
        )}
        {isCompleted && (booking.vehicleId || booking.driverId) && booking.hasReview && (
          <span className={styles.btnReview} style={{ opacity: 0.6, cursor: "default" }}>
            ✅ Avis publié
          </span>
        )}
        {canCancel && booking.type === "location" && !showModify && (
          <button className={styles.btnContract} onClick={() => { setShowModify(true); setModifyForm({ startDate: "", endDate: "" }); setModifyError(null); }}>
            📅 Modifier les dates
          </button>
        )}
        {canCancel && !confirmCancel && (
          <button className={styles.btnDanger} onClick={() => setConfirmCancel(true)}>
            Annuler
          </button>
        )}
        {showModify && (
          <div className={styles.confirmBar} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={modifyForm.startDate} onChange={(e) => setModifyForm((p) => ({ ...p, startDate: e.target.value }))} style={{ flex: 1 }} />
              <input type="date" value={modifyForm.endDate} onChange={(e) => setModifyForm((p) => ({ ...p, endDate: e.target.value }))} style={{ flex: 1 }} />
            </div>
            {modifyError && <span style={{ color: "#dc2626", fontSize: ".82rem" }}>{modifyError}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className={styles.btnDangerSm} disabled={modifying} onClick={handleModifyDates}>
                {modifying ? "…" : "Confirmer les nouvelles dates"}
              </button>
              <button className={styles.btnGhost} onClick={() => setShowModify(false)}>Annuler</button>
            </div>
          </div>
        )}
        {confirmCancel && (
          <div className={styles.confirmBar}>
            <span>
              Confirmer l'annulation ?
              {booking.isPaid && ONLINE_PAY_METHODS.includes(booking.paidWith)
                ? " Un paiement en ligne a été effectué — le remboursement sera traité manuellement par notre équipe après confirmation."
                : " Aucun paiement en ligne n'a été prélevé pour cette réservation."}
            </span>
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
