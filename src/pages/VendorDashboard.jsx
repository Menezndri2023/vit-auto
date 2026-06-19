import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import { Link, useNavigate } from "react-router-dom";
import styles from "./VendorDashboard.module.css";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " DH";

const COMMISSION_LOCATION = 0.15;
const COMMISSION_VENTE    = 0.03;
const SERVICE_FEE         = 1000;

const STATUS_CONFIG = {
  approved: { label: "Approuvé",   cls: styles.statusApproved },
  pending:  { label: "En attente", cls: styles.statusPending  },
  rejected: { label: "Rejeté",     cls: styles.statusRejected },
};

const BOOKING_STATUS = {
  "À confirmer": { label: "Nouvelle",      color: "#f59e0b", bg: "#fffbeb" },
  pending:       { label: "Nouvelle",      color: "#f59e0b", bg: "#fffbeb" },
  confirmed:     { label: "Acceptée",      color: "#10b981", bg: "#ecfdf5" },
  preparing:     { label: "En cours",      color: "#06b6d4", bg: "#ecfeff" },
  ready:         { label: "Prête",         color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:   { label: "En route",      color: "#3b82f6", bg: "#eff6ff" },
  completed:     { label: "Terminée",      color: "#64748b", bg: "#f8fafc" },
  cancelled:     { label: "Annulée",       color: "#ef4444", bg: "#fef2f2" },
};

// Étapes du suivi (cases à cocher) — après acceptation
// "Acceptée" est gérée par le bloc DÉCISION, pas dans ces cases
const CHECKLIST_STEPS = [
  { key: "preparing",   label: "En cours",   icon: "⚙️", hint: "Vous préparez le véhicule"              },
  { key: "ready",       label: "Prête",      icon: "🚗", hint: "Le véhicule est prêt pour la livraison" },
  { key: "in_progress", label: "En route",   icon: "🚀", hint: "Vous êtes en route vers le client"      },
  { key: "completed",   label: "Terminée",   icon: "🏁", hint: "Location terminée"                      },
];

const STEP_ORDER = ["pending", "confirmed", "preparing", "ready", "in_progress", "completed"];

const TYPE_LABELS = { location: "Location", essai: "Essai", chauffeur: "Chauffeur" };

// ── Modal GÉRER — redesign complet avec cases à cocher ─────────────────────────
function GererModal({ order, onClose, onConfirm, onPrepare, onReady, onInProgress, onComplete, onReject }) {
  if (!order) return null;

  const bst         = BOOKING_STATUS[order.status] || BOOKING_STATUS.pending;
  const isNew       = !order.status || order.status === "À confirmer" || order.status === "pending";
  const isAccepted  = !isNew && order.status !== "cancelled";

  const hasGps      = order.pickupLat != null && order.pickupLng != null;
  const isLivraison = order.pickupMethod === "livraison" || order.pickupLocation;

  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${order.pickupLat},${order.pickupLng}`
    : order.pickupAddress
      ? `https://www.google.com/maps/search/${encodeURIComponent(order.pickupAddress)}`
      : null;

  const currentStepIdx = STEP_ORDER.indexOf(order.status);

  // Quelle action appeler pour passer à l'étape suivante
  const NEXT_ACTIONS = {
    confirmed:   { fn: onPrepare,     label: "Marquer en cours",  btnClass: styles.btnStepPrepare },
    preparing:   { fn: onReady,       label: "Marquer prête",     btnClass: styles.btnStepReady   },
    ready:       { fn: onInProgress,  label: "Marquer en route",  btnClass: styles.btnStepRoute   },
    in_progress: { fn: onComplete,    label: "Marquer terminée",  btnClass: styles.btnStepDone    },
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.gererModal} onClick={(e) => e.stopPropagation()}>

        {/* ══ EN-TÊTE ══ */}
        <div className={styles.gererHeader}>
          <div>
            <span className={styles.gererType}>{TYPE_LABELS[order.type] || order.type}</span>
            <h2 className={styles.gererTitle}>{order.vehicleName || "Commande"}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className={styles.orderStatus} style={{ background: bst.bg, color: bst.color, fontSize: "0.82rem", padding: "0.3rem 0.75rem" }}>
              {bst.label}
            </span>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </div>

        <div className={styles.gererBody}>

          {/* ══ INFOS CLIENT ══ */}
          <section className={styles.gererSection}>
            <h3 className={styles.gererSectionTitle}>👤 Client</h3>
            <div className={styles.clientCard}>
              <div className={styles.clientMain}>
                <span className={styles.clientName}>{order.firstName} {order.lastName}</span>
                {order.phone && (
                  <a href={`tel:${order.phone}`} className={styles.clientPhone}>
                    📞 {order.phone}
                  </a>
                )}
              </div>
              <div className={styles.clientSub}>
                {order.email && (
                  <a href={`mailto:${order.email}`} className={styles.clientEmail}>{order.email}</a>
                )}
                {order.clientVerification?.idType && (
                  <span className={styles.idBadge}>
                    {order.clientVerification.idType.toUpperCase()} {order.clientVerification.idNumber}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ══ DÉTAILS COMMANDE ══ */}
          <section className={styles.gererSection}>
            <h3 className={styles.gererSectionTitle}>📋 Commande</h3>
            <div className={styles.orderSummary}>
              {order.type === "location" && (
                <>
                  <div className={styles.summaryRow}>
                    <span>Période</span>
                    <strong>
                      {order.startDate ? new Date(order.startDate).toLocaleDateString("fr-FR") : "—"}
                      {" → "}
                      {order.endDate ? new Date(order.endDate).toLocaleDateString("fr-FR") : "—"}
                      {order.days ? ` (${order.days}j)` : ""}
                    </strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Total client</span>
                    <strong>{fmt(order.total || 0)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Votre net</span>
                    <strong className={styles.netAmount}>
                      {fmt(order.partnerPayout || Math.max((order.baseTotal || 0) * 0.85 - SERVICE_FEE, 0))}
                    </strong>
                  </div>
                </>
              )}
              {order.type === "essai" && (
                <div className={styles.summaryRow}>
                  <span>Date souhaitée</span>
                  <strong>
                    {order.preferredDate ? new Date(order.preferredDate).toLocaleDateString("fr-FR") : "—"}
                    {order.preferredTime ? ` à ${order.preferredTime}` : ""}
                  </strong>
                </div>
              )}
              <div className={styles.summaryRow}>
                <span>Paiement</span>
                <strong className={order.isPaid ? styles.paidOk : styles.paidPending}>
                  {order.isPaid ? "✅ Payé" : "⏳ En attente"}
                </strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Reçue le</span>
                <strong>
                  {order.createdAt
                    ? new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })
                    : "—"}
                </strong>
              </div>
            </div>
          </section>

          {/* ══ LIVRAISON GPS ══ */}
          {isLivraison && (
            <section className={styles.gererSection}>
              <h3 className={styles.gererSectionTitle}>📍 Lieu de livraison</h3>
              <div className={styles.gpsBlock}>
                <div className={styles.gpsInfo}>
                  <div className={styles.gpsAddress}>
                    <span className={styles.gpsIcon}>📌</span>
                    <div>
                      <p className={styles.gpsAddressText}>
                        {order.pickupAddress || order.pickupLocation || "Adresse non précisée"}
                      </p>
                      {hasGps && (
                        <p className={styles.gpsCoords}>
                          GPS : {Number(order.pickupLat).toFixed(5)}, {Number(order.pickupLng).toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsBtn}>
                      🗺️ Maps
                    </a>
                  )}
                </div>
                {hasGps && (
                  <div className={styles.gpsMapFrame}>
                    <iframe
                      title="Carte livraison"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${order.pickupLng - 0.01},${order.pickupLat - 0.01},${order.pickupLng + 0.01},${order.pickupLat + 0.01}&layer=mapnik&marker=${order.pickupLat},${order.pickupLng}`}
                      className={styles.gpsIframe}
                    />
                  </div>
                )}
              </div>
              {order.returnLocation && (
                <div className={styles.returnBlock}>
                  <span className={styles.gpsIcon}>🔄</span>
                  <div>
                    <p className={styles.returnLabel}>Lieu de retour</p>
                    <p className={styles.gpsAddressText}>{order.returnLocation}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ══ DÉCISION — nouvelle commande ══ */}
          {isNew && (
            <section className={styles.gererSection}>
              <h3 className={styles.gererSectionTitle}>⚡ Décision</h3>
              <div className={styles.decisionBlock}>
                <button
                  className={styles.btnDecisionAccept}
                  onClick={() => onConfirm(order.id)}
                >
                  <span className={styles.decisionIcon}>✅</span>
                  <div>
                    <span className={styles.decisionLabel}>Accepter</span>
                    <span className={styles.decisionHint}>Le client sera notifié</span>
                  </div>
                </button>
                <button
                  className={styles.btnDecisionRefuse}
                  onClick={() => onReject(order.id)}
                >
                  <span className={styles.decisionIcon}>✕</span>
                  <div>
                    <span className={styles.decisionLabel}>Refuser</span>
                    <span className={styles.decisionHint}>Avec raison optionnelle</span>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* ══ SUIVI — cases à cocher (une fois acceptée) ══ */}
          {isAccepted && (
            <section className={styles.gererSection}>
              <h3 className={styles.gererSectionTitle}>📊 Suivi de commande</h3>

              {/* ── Bandeau statut actuel ── */}
              {order.status === "confirmed" && (
                <div className={styles.acceptedBanner}>
                  ✅ Commande acceptée — le client a été notifié. Cliquez sur "Marquer en cours" quand vous commencez la préparation.
                </div>
              )}
              {order.status === "preparing" && (
                <div className={styles.preparingBanner}>
                  ⚙️ En cours de préparation — cliquez "Marquer prête" quand le véhicule est prêt.
                </div>
              )}
              {order.status === "ready" && (
                <div className={styles.readyBanner}>
                  🚗 Véhicule prêt — cliquez "Marquer en route" quand vous partez vers le client.
                </div>
              )}
              {order.status === "in_progress" && (
                <div className={styles.inProgressBanner}>
                  🚀 En route ! Cliquez "Marquer terminée" une fois la livraison effectuée.
                </div>
              )}

              {/* ── Bouton action principale — EN DEHORS des cases ── */}
              {(() => {
                const nextAction = NEXT_ACTIONS[order.status];
                if (!nextAction || order.status === "completed") return null;
                return (
                  <button
                    className={`${styles.btnMainStep} ${nextAction.btnClass}`}
                    onClick={() => nextAction.fn(order.id)}
                  >
                    <span className={styles.btnMainStepLabel}>{nextAction.label}</span>
                    <span className={styles.btnMainStepHint}>Le client sera notifié automatiquement</span>
                  </button>
                );
              })()}

              {/* ── Cases à cocher cliquables ── */}
              <div className={styles.checklist}>
                {CHECKLIST_STEPS.map((step, idx) => {
                  const stepIdx    = STEP_ORDER.indexOf(step.key);
                  const isDoneStep = currentStepIdx > stepIdx;
                  const isCurrent  = currentStepIdx === stepIdx;
                  const isFuture   = currentStepIdx < stepIdx;
                  const nextAction = NEXT_ACTIONS[order.status];
                  const isNextStep = nextAction && STEP_ORDER.indexOf(step.key) === currentStepIdx + 1 && order.status !== "completed";

                  return (
                    <div
                      key={step.key}
                      className={[
                        styles.checkItem,
                        isDoneStep ? styles.checkItemDone    : "",
                        isCurrent  ? styles.checkItemCurrent : "",
                        isFuture   ? styles.checkItemFuture  : "",
                        isNextStep ? styles.checkItemNext    : "",
                      ].join(" ")}
                      onClick={isNextStep ? () => nextAction.fn(order.id) : undefined}
                      title={isNextStep ? `Cliquer pour : ${nextAction.label}` : undefined}
                    >
                      {/* Case à cocher */}
                      <div className={[
                        styles.checkbox,
                        isDoneStep ? styles.checkboxDone    : "",
                        isCurrent  ? styles.checkboxCurrent : "",
                        isNextStep ? styles.checkboxNext    : "",
                      ].join(" ")}>
                        {isDoneStep && <span>✓</span>}
                        {isCurrent  && <span>{step.icon}</span>}
                        {isNextStep && <span className={styles.checkboxNextIcon}>+</span>}
                      </div>

                      {/* Ligne verticale de connexion */}
                      {idx < CHECKLIST_STEPS.length - 1 && (
                        <div className={`${styles.checkLine} ${isDoneStep ? styles.checkLineDone : ""}`} />
                      )}

                      {/* Contenu */}
                      <div className={styles.checkContent}>
                        <span className={styles.checkLabel}>{step.label}</span>
                        <span className={styles.checkHint}>{step.hint}</span>
                      </div>

                      {/* Indicateur cliquable */}
                      {isNextStep && (
                        <span className={styles.checkClickHint}>Cliquer ici →</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {order.status === "completed" && (
                <div className={styles.completedBlock}>🏁 Commande terminée avec succès</div>
              )}

              {/* Lien contrat partenaire — Link React (pas de rechargement) */}
              <Link
                to={`/contract/${order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnContractLink}
              >
                📄 Voir / Générer le contrat
              </Link>

              {order.status !== "completed" && (
                <button className={styles.btnCancelOrder} onClick={() => onReject(order.id)}>
                  ✕ Annuler cette commande
                </button>
              )}
            </section>
          )}

          {/* Annulée */}
          {order.status === "cancelled" && (
            <div className={styles.cancelledBlock}>
              ❌ Commande annulée{order.vendorNote ? ` — ${order.vendorNote}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function VendorDashboard() {
  const { user, isAuthenticated, token } = useAuth();
  const {
    partnerVehicles: myVehicles,
    partnerBookings,
    bookings,
    updateBookingStatus,
    loadPartnerVehicles,
    loadPartnerOrders,
  } = useVehicles();
  const { success: toastSuccess, error: toastError } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]       = useState("annonces");
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading]     = useState(true);
  const [boostTarget, setBoostTarget]   = useState(null);
  const [boostMsg, setBoostMsg]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderFilter, setOrderFilter]   = useState("all");
  const [rejectModal, setRejectModal]   = useState(null); // bookingId
  const [rejectNote, setRejectNote]     = useState("");
  const [gererModalId, setGererModalId] = useState(null); // order id

  useEffect(() => {
    if (!isAuthenticated || !token) { setSubLoading(false); return; }
    fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubscription(d.subscription))
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [isAuthenticated, token]);

  // IDs des véhicules du partenaire (pour filtrer les commandes localStorage)
  const myVehicleIds = useMemo(
    () => new Set(myVehicles.map((v) => String(v.id || v._id))),
    [myVehicles]
  );

  // Commandes depuis localStorage filtrées par véhicules du partenaire
  const localOrders = useMemo(
    () => bookings.filter((b) => myVehicleIds.has(String(b.vehicleId))),
    [bookings, myVehicleIds]
  );

  // Fusion localStorage + backend (le backend a priorité — il a les données GPS et le statut réel)
  const allOrders = useMemo(() => {
    const map = new Map();
    localOrders.forEach((b)     => map.set(String(b.id), b));
    partnerBookings.forEach((b) => map.set(String(b.id), { ...map.get(String(b.id)), ...b }));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [localOrders, partnerBookings]);

  // Dérivé de allOrders → se met à jour automatiquement quand le statut change
  const gererModal = useMemo(
    () => (gererModalId != null ? allOrders.find((o) => String(o.id) === String(gererModalId)) ?? null : null),
    [gererModalId, allOrders]
  );

  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return allOrders;
    const map = {
      new:       ["À confirmer", "pending"],
      confirmed: ["confirmed", "preparing", "ready", "in_progress"],
      done:      ["completed"],
      cancelled: ["cancelled"],
    };
    return allOrders.filter((b) => (map[orderFilter] || []).includes(b.status));
  }, [allOrders, orderFilter]);

  const stats = useMemo(() => {
    const approved   = myVehicles.filter((v) => v.status === "approved");
    const locationV  = approved.filter((v) => v.mode === "Louer");
    const venteV     = approved.filter((v) => v.mode === "Acheter");
    const grossLoc   = locationV.reduce((s, v) => s + (v.pricePerDay || 0) * 7, 0);
    const commLoc    = Math.round(grossLoc * COMMISSION_LOCATION);
    const grossVte   = venteV.reduce((s, v) => s + (v.buyPrice || 0), 0) * 0.1;
    const commVte    = Math.round(grossVte * COMMISSION_VENTE);
    const netRev     = Math.max(grossLoc + grossVte - commLoc - commVte - SERVICE_FEE * approved.length, 0);
    const newOrders  = allOrders.filter((b) => b.status === "À confirmer" || b.status === "pending").length;
    return {
      total:    myVehicles.length,
      approved: approved.length,
      pending:  myVehicles.filter((v) => (v.status || "pending") === "pending").length,
      rejected: myVehicles.filter((v) => v.status === "rejected").length,
      netRev, newOrders,
    };
  }, [myVehicles, allOrders]);

  const isPro  = subscription?.plan === "pro" && subscription?.proDetails?.isActive;
  const proEnd = subscription?.proDetails?.endDate
    ? new Date(subscription.proDetails.endDate).toLocaleDateString("fr-FR") : null;

  const handleBoost = async (vehicleId) => {
    if (!token) { navigate("/login"); return; }
    setBoostTarget(vehicleId);
    try {
      const r = await fetch("/api/subscriptions/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicleId }),
      });
      const d = await r.json();
      setBoostMsg(r.ok ? "Mise en avant activée 30 jours !" : d.message || "Erreur.");
    } catch { setBoostMsg("Erreur réseau."); }
    finally { setBoostTarget(null); }
  };

  const handleDeleteVehicle = async (id) => {
    if (!confirm("Supprimer définitivement cette annonce ?")) return;
    try {
      await fetch(`/api/vehicles/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore network error */ }
    loadPartnerVehicles();
  };

  const handleConfirm = useCallback((id) => {
    updateBookingStatus(id, "confirmed");
    toastSuccess("✅ Commande acceptée — le client a été notifié.");
    setTimeout(() => loadPartnerOrders(), 800);
  }, [updateBookingStatus, toastSuccess, loadPartnerOrders]);

  const handlePrepare = useCallback((id) => {
    updateBookingStatus(id, "preparing");
    toastSuccess("⚙️ En cours — le client a été informé.");
    setTimeout(() => loadPartnerOrders(), 800);
  }, [updateBookingStatus, toastSuccess, loadPartnerOrders]);

  const handleReady = useCallback((id) => {
    updateBookingStatus(id, "ready");
    toastSuccess("🚗 Véhicule prêt — le client a été notifié.");
    setTimeout(() => loadPartnerOrders(), 800);
  }, [updateBookingStatus, toastSuccess, loadPartnerOrders]);

  const handleInProgress = useCallback((id) => {
    updateBookingStatus(id, "in_progress");
    toastSuccess("🚀 En route ! Le client a été alerté.");
    setTimeout(() => loadPartnerOrders(), 800);
  }, [updateBookingStatus, toastSuccess, loadPartnerOrders]);

  const handleComplete = useCallback((id) => {
    updateBookingStatus(id, "completed");
    toastSuccess("🏁 Commande terminée avec succès.");
    setTimeout(() => loadPartnerOrders(), 800);
  }, [updateBookingStatus, toastSuccess, loadPartnerOrders]);

  const handleReject = useCallback(() => {
    if (!rejectModal) return;
    updateBookingStatus(rejectModal, "cancelled", rejectNote);
    toastError("Commande refusée — le client a été informé.");
    setRejectModal(null);
    setRejectNote("");
    setGererModalId(null);
    setTimeout(() => loadPartnerOrders(), 800);
  }, [rejectModal, rejectNote, updateBookingStatus, toastError, loadPartnerOrders]);

  const handleGerer = useCallback((order) => setGererModalId(order.id), []);
  const [refreshing,  setRefreshing]  = useState(false);
  const [myDrivers,   setMyDrivers]   = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);

  const loadMyDrivers = useCallback(async () => {
    if (!token) return;
    setDriverLoading(true);
    try {
      const res = await fetch("/api/drivers/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyDrivers(data.drivers || []);
      }
    } catch { /* ignore */ }
    finally { setDriverLoading(false); }
  }, [token]);

  useEffect(() => { loadMyDrivers(); }, [loadMyDrivers]);

  const handleDeleteDriver = useCallback(async (id) => {
    if (!confirm("Supprimer définitivement ce profil chauffeur ?")) return;
    try {
      await fetch(`/api/drivers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyDrivers((prev) => prev.filter((d) => d._id !== id));
      toastSuccess("Profil chauffeur supprimé.");
    } catch { toastError("Erreur lors de la suppression."); }
  }, [token, toastSuccess, toastError]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPartnerOrders(), loadPartnerVehicles(), loadMyDrivers()]);
    setRefreshing(false);
    toastSuccess("Données actualisées");
  }, [loadPartnerOrders, loadPartnerVehicles, loadMyDrivers, toastSuccess]);

  const filteredVehicles = statusFilter === "all"
    ? myVehicles
    : myVehicles.filter((v) => (v.status || "pending") === statusFilter);

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyStats}>
          <h1>Espace Partenaire</h1>
          <p>Connectez-vous avec un compte partenaire.</p>
          <Link to="/login" className={`${styles.actionBtn} ${styles.editBtn}`} style={{ display: "inline-block", marginTop: "1rem", padding: "0.875rem 2rem" }}>
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div>
          <h1>Espace Partenaire</h1>
          <p>Bienvenue {user.firstName || user.name} — gérez vos annonces et commandes</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className={`${styles.actionBtn} ${styles.viewBtn}`} onClick={handleRefresh} disabled={refreshing} style={{ padding: "0.75rem 1.25rem" }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
            {refreshing ? " …" : " Actualiser"}
          </button>
          <Link to="/plans" className={`${styles.actionBtn} ${styles.viewBtn}`} style={{ padding: "0.75rem 1.25rem" }}>Tarifs</Link>
          <Link to="/vendor" className={`${styles.actionBtn} ${styles.editBtn}`} style={{ padding: "0.75rem 1.25rem" }}>+ Nouvelle annonce</Link>
        </div>
      </header>

      {/* ── Plan banner ── */}
      {!subLoading && (
        <div className={isPro ? styles.proBanner : styles.freeBanner}>
          <span className={isPro ? styles.planBadge : styles.planBadgeFree}>{isPro ? "Pro" : "Gratuit"}</span>
          <div>
            <strong>{isPro ? `Plan Pro actif — expire le ${proEnd}` : "Plan Gratuit"}</strong>
            <span>{isPro ? "Vos annonces sont mises en avant automatiquement." : "Passez en Pro pour la mise en avant automatique."}</span>
          </div>
          {!isPro && <Link to="/plans" className={styles.upgradeBtn}>Passer en Pro →</Link>}
        </div>
      )}

      {/* ── Commission info ── */}
      <div className={styles.commissionBanner}>
        <div className={styles.commItem}><span>Commission location</span><strong>15 %</strong></div>
        <div className={styles.commItem}><span>Commission vente</span><strong>3 %</strong></div>
        <div className={styles.commItem}><span>Frais de service</span><strong>15 DH / réservation</strong></div>
        <div className={styles.commItem} style={{ borderLeft: "2px solid #10b981" }}>
          <span>Revenus nets estimés / semaine</span>
          <strong style={{ color: "#10b981" }}>{fmt(stats.netRev)}</strong>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)" }}>
          <span className={styles.statNumber}>{stats.total}</span>
          <span className={styles.statLabel}>Annonces</span>
        </div>
        <div className={styles.statCard} style={{ background: "linear-gradient(135deg,#065f46,#10b981)" }}>
          <span className={styles.statNumber}>{stats.approved}</span>
          <span className={styles.statLabel}>Publiées</span>
        </div>
        <div className={styles.statCard} style={{ background: "linear-gradient(135deg,#78350f,#f59e0b)" }}>
          <span className={styles.statNumber}>{stats.pending}</span>
          <span className={styles.statLabel}>En attente</span>
        </div>
        <div className={styles.statCard} style={{ background: "linear-gradient(135deg,#312e81,#6366f1)" }}>
          <span className={styles.statNumber}>{fmt(stats.netRev)}</span>
          <span className={styles.statLabel}>Revenus nets estimés</span>
        </div>
        <div className={styles.statCard} style={{ background: "linear-gradient(135deg,#7f1d1d,#ef4444)", position: "relative" }}>
          <span className={styles.statNumber}>{allOrders.length}</span>
          <span className={styles.statLabel}>Commandes reçues</span>
          {stats.newOrders > 0 && (
            <span className={styles.newBadge}>{stats.newOrders} nouveau{stats.newOrders > 1 ? "x" : ""}</span>
          )}
        </div>
      </div>

      {boostMsg && (
        <div className={styles.boostMessage}>
          {boostMsg}
          <button onClick={() => setBoostMsg("")} style={{ marginLeft: "1rem", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* ── Onglets ── */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "annonces" ? styles.tabActive : ""}`} onClick={() => setActiveTab("annonces")}>
          Mes annonces ({myVehicles.length})
        </button>
        <button className={`${styles.tab} ${activeTab === "commandes" ? styles.tabActive : ""}`} onClick={() => setActiveTab("commandes")}>
          Commandes ({allOrders.length})
          {stats.newOrders > 0 && <span className={styles.tabBadge}>{stats.newOrders}</span>}
        </button>
      </div>

      {/* ══ TAB ANNONCES ══ */}
      {activeTab === "annonces" && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Mes véhicules ({filteredVehicles.length})</h2>
            <select className={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              <option value="approved">Approuvés</option>
              <option value="pending">En attente</option>
              <option value="rejected">Rejetés</option>
            </select>
          </div>

          {filteredVehicles.length === 0 ? (
            <div className={styles.emptyStats}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🚗</div>
              <h3>Aucune annonce</h3>
              <p>Publiez votre première annonce pour commencer.</p>
              <Link to="/vendor" className={`${styles.actionBtn} ${styles.editBtn}`} style={{ display: "inline-block", marginTop: "1rem", padding: "0.875rem 2rem" }}>
                + Publier une annonce
              </Link>
            </div>
          ) : (
            <div className={styles.vehicleGrid}>
              {filteredVehicles.map((vehicle) => {
                const vid       = vehicle.id || vehicle._id;
                const status    = STATUS_CONFIG[vehicle.status || "pending"];
                const isBoosted = subscription?.boosts?.some((b) => b.isActive && String(b.vehicle) === String(vid));
                const commRate  = vehicle.mode === "Louer" ? COMMISSION_LOCATION : COMMISSION_VENTE;
                const priceLabel = vehicle.pricePerDay ? `${fmt(vehicle.pricePerDay)} / jour` : vehicle.buyPrice ? fmt(vehicle.buyPrice) : "—";
                const netLabel   = vehicle.pricePerDay ? `Net : ${fmt(Math.round(vehicle.pricePerDay * (1 - commRate) - SERVICE_FEE / 30))} / jour` : "—";
                const orderCount = allOrders.filter((b) => String(b.vehicleId) === String(vid)).length;

                return (
                  <div key={vid} className={`${styles.vehicleCard} ${isBoosted ? styles.vehicleCardBoosted : ""}`}>
                    {isBoosted && <div className={styles.boostBadge}>En vedette</div>}
                    <div className={styles.vehicleHeader}>
                      <div className={styles.vehicleImage}>
                        {vehicle.image ? <img src={vehicle.image} alt={vehicle.name} /> : <span style={{ fontSize: "1.8rem" }}>🚗</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3>{vehicle.name}</h3>
                        <div className={styles.vehicleStatus}>
                          <span className={status.cls}>{status.label}</span>
                          {vehicle.validationScore != null && (
                            <span className={styles.scoreChip} style={{
                              color:      vehicle.validationScore >= 65 ? "#10b981" : vehicle.validationScore >= 40 ? "#f59e0b" : "#ef4444",
                              background: vehicle.validationScore >= 65 ? "#ecfdf5"  : vehicle.validationScore >= 40 ? "#fffbeb"  : "#fef2f2",
                            }}>
                              {vehicle.validationScore}/100
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {vehicle.validationScore != null && (vehicle.status === "pending" || vehicle.status === "rejected") && (
                      <div className={styles.validationBlock}>
                        <div className={styles.scoreBarWrap}>
                          <div className={styles.scoreBarFill} style={{
                            width: `${vehicle.validationScore}%`,
                            background: vehicle.validationScore >= 65 ? "#10b981" : vehicle.validationScore >= 40 ? "#f59e0b" : "#ef4444",
                          }} />
                        </div>
                        {vehicle.validationErrors?.length > 0 && (
                          <ul className={styles.validErrList}>
                            {vehicle.validationErrors.map((e, i) => <li key={i} className={styles.validErrItem}>❌ {e}</li>)}
                          </ul>
                        )}
                        {vehicle.validationWarnings?.length > 0 && (
                          <ul className={styles.validWarnList}>
                            {vehicle.validationWarnings.slice(0, 3).map((w, i) => <li key={i} className={styles.validWarnItem}>⚠️ {w}</li>)}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className={styles.vehicleTags}>
                      <span className={`${styles.tag} ${styles.tagMode}`}>{vehicle.mode}</span>
                      <span className={`${styles.tag} ${styles.tagType}`}>{vehicle.type}</span>
                      {vehicle.fuel && <span className={`${styles.tag} ${styles.tagFuel}`}>{vehicle.fuel}</span>}
                    </div>
                    <div className={styles.priceLine}>
                      <span>{priceLabel}</span>
                      <small>{netLabel}</small>
                    </div>
                    {orderCount > 0 && (
                      <button className={styles.orderHintBtn} onClick={() => { setActiveTab("commandes"); setOrderFilter("all"); }}>
                        {orderCount} commande{orderCount > 1 ? "s" : ""} →
                      </button>
                    )}
                    <p className={styles.vehicleDescription}>{vehicle.description || "Pas de description disponible"}</p>
                    <div className={styles.cardActions}>
                      <Link to={`/vendor?edit=${vid}`} className={`${styles.actionBtn} ${styles.editBtn}`}>Modifier</Link>
                      <Link to={`/vehicle/${vid}`} className={`${styles.actionBtn} ${styles.viewBtn}`}>Voir</Link>
                      {!isBoosted && (
                        <button className={`${styles.actionBtn} ${styles.boostBtn}`} onClick={() => handleBoost(vid)} disabled={boostTarget === vid}>
                          {boostTarget === vid ? "..." : "Booster"}
                        </button>
                      )}
                      <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteVehicle(vid)}>Supprimer</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Mes profils chauffeurs ── */}
          <div className={styles.sectionHeader} style={{ marginTop: "2.5rem" }}>
            <h2>Mes profils chauffeurs ({myDrivers.length})</h2>
            <Link to="/vendor" className={`${styles.actionBtn} ${styles.editBtn}`} style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
              + Ajouter un chauffeur
            </Link>
          </div>

          {driverLoading ? (
            <p style={{ color: "#64748b", padding: "1rem 0" }}>Chargement…</p>
          ) : myDrivers.length === 0 ? (
            <div className={styles.emptyStats} style={{ padding: "2rem", marginTop: 0 }}>
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>👨‍✈️</div>
              <h3>Aucun profil chauffeur</h3>
              <p>Publiez votre premier profil chauffeur depuis "Nouvelle annonce".</p>
            </div>
          ) : (
            <div className={styles.vehicleGrid}>
              {myDrivers.map((drv) => {
                const drvStatus = STATUS_CONFIG[drv.status || "pending"];
                return (
                  <div key={drv._id} className={styles.vehicleCard}>
                    <div className={styles.vehicleImage} style={{ background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem" }}>
                      {drv.profilePhoto
                        ? <img src={drv.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : "👨‍✈️"}
                    </div>
                    <div className={styles.vehicleInfo}>
                      <div className={styles.vehicleHeader}>
                        <div>
                          <h3 className={styles.vehicleName}>{drv.firstName} {drv.lastName}</h3>
                          <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>{drv.title || "Service chauffeur"}</p>
                        </div>
                        <span className={drvStatus?.cls || ""} style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700,
                          color: drv.status === "approved" ? "#10b981" : drv.status === "rejected" ? "#ef4444" : "#f59e0b",
                          background: drv.status === "approved" ? "#ecfdf5" : drv.status === "rejected" ? "#fef2f2" : "#fffbeb",
                        }}>
                          {drvStatus?.label || "En attente"}
                        </span>
                      </div>
                      <div className={styles.vehicleTags} style={{ marginTop: 8 }}>
                        {drv.disponibilite && <span className={`${styles.tag} ${styles.tagMode}`}>{drv.disponibilite}</span>}
                        {drv.zone && <span className={`${styles.tag} ${styles.tagType}`}>{drv.zone}</span>}
                        {drv.permisCategorie && <span className={`${styles.tag} ${styles.tagFuel}`}>Permis {drv.permisCategorie}</span>}
                      </div>
                      <div className={styles.priceLine}>
                        <span>{drv.tarif ? `${Number(drv.tarif).toLocaleString("fr-FR")} DH / jour` : "Tarif non renseigné"}</span>
                        {drv.tarifHeure > 0 && <small>{Number(drv.tarifHeure).toLocaleString("fr-FR")} DH / h</small>}
                      </div>
                      <div className={styles.cardActions}>
                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteDriver(drv._id)}>Supprimer</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB COMMANDES ══ */}
      {activeTab === "commandes" && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Commandes reçues ({filteredOrders.length})</h2>
            <select className={styles.filterSelect} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              <option value="new">Nouvelles</option>
              <option value="confirmed">En traitement</option>
              <option value="done">Terminées</option>
              <option value="cancelled">Annulées</option>
            </select>
          </div>

          {filteredOrders.length === 0 ? (
            <div className={styles.emptyStats}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
              <h3>Aucune commande</h3>
              <p>Les réservations de vos clients apparaîtront ici.</p>
            </div>
          ) : (
            <div className={styles.ordersList}>
              {filteredOrders.map((order) => {
                const bst       = BOOKING_STATUS[order.status] || BOOKING_STATUS.pending;
                const typeLabel = TYPE_LABELS[order.type] || order.type;
                const isNew     = !order.status || order.status === "À confirmer" || order.status === "pending";
                const isDone    = order.status === "completed" || order.status === "cancelled";
                const hasGps    = order.pickupLat != null && order.pickupLng != null;
                const isLiv     = order.pickupMethod === "livraison" || order.pickupLocation;

                return (
                  <div key={order.id} className={`${styles.orderCard} ${isNew ? styles.orderCardNew : ""}`}>
                    {/* En-tête */}
                    <div className={styles.orderHeader}>
                      <div className={styles.orderTitle}>
                        <span className={styles.orderType}>{typeLabel}</span>
                        <strong>{order.vehicleName}</strong>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span className={styles.orderStatus} style={{ background: bst.bg, color: bst.color }}>
                          {bst.label}
                        </span>
                      </div>
                    </div>

                    {/* Infos client */}
                    <div className={styles.orderGrid}>
                      <div className={styles.orderInfo}>
                        <span>Client</span>
                        <strong>{order.firstName} {order.lastName}</strong>
                      </div>
                      <div className={styles.orderInfo}>
                        <span>Contact</span>
                        <strong>
                          {order.phone
                            ? <a href={`tel:${order.phone}`} className={styles.phoneLink}>{order.phone}</a>
                            : order.email}
                        </strong>
                      </div>
                      {order.type === "location" && (
                        <>
                          <div className={styles.orderInfo}>
                            <span>Période</span>
                            <strong>
                              {order.startDate ? new Date(order.startDate).toLocaleDateString("fr-FR") : order.startDate}
                              {" → "}
                              {order.endDate   ? new Date(order.endDate).toLocaleDateString("fr-FR")   : order.endDate}
                              {order.days ? ` (${order.days}j)` : ""}
                            </strong>
                          </div>
                          <div className={styles.orderInfo}>
                            <span>Lieu de prise en charge</span>
                            <strong className={isLiv ? styles.deliveryAddr : ""}>
                              {isLiv ? "🚚 " : "📍 "}
                              {order.pickupAddress || order.pickupLocation || "—"}
                              {hasGps && <span className={styles.gpsPill}>GPS</span>}
                            </strong>
                          </div>
                          <div className={styles.orderInfo}>
                            <span>Total client</span>
                            <strong>{fmt(order.total || 0)}</strong>
                          </div>
                          <div className={styles.orderInfo}>
                            <span>Votre net</span>
                            <strong style={{ color: "#10b981" }}>
                              {fmt(order.partnerPayout || Math.max((order.baseTotal || 0) * 0.85 - SERVICE_FEE, 0))}
                            </strong>
                          </div>
                        </>
                      )}
                      {order.type === "essai" && (
                        <>
                          <div className={styles.orderInfo}>
                            <span>Date RDV</span>
                            <strong>
                              {order.preferredDate ? new Date(order.preferredDate).toLocaleDateString("fr-FR") : order.preferredDate}
                              {order.preferredTime ? ` à ${order.preferredTime}` : ""}
                            </strong>
                          </div>
                          {order.notes && (
                            <div className={styles.orderInfo}>
                              <span>Notes</span>
                              <strong>{order.notes}</strong>
                            </div>
                          )}
                        </>
                      )}
                      {order.clientVerification?.idType && (
                        <div className={styles.orderInfo}>
                          <span>Pièce d'identité</span>
                          <strong style={{ color: "#6366f1" }}>
                            {order.clientVerification.idType.toUpperCase()} — {order.clientVerification.idNumber}
                          </strong>
                        </div>
                      )}
                      <div className={styles.orderInfo}>
                        <span>Paiement</span>
                        <strong>{order.paidWith || "—"}</strong>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className={styles.orderActions}>
                      <button className={`${styles.btnGerer} ${isNew ? styles.btnGererNew : ""}`} onClick={() => handleGerer(order)}>
                        {isNew ? "⚡ Traiter" : "⚙️ Gérer"}
                      </button>
                      {!isDone && isNew && (
                        <button className={styles.btnConfirm} onClick={() => handleConfirm(order.id)}>
                          ✅ Accepter
                        </button>
                      )}
                      {!isDone && isNew && (
                        <button className={styles.btnReject} onClick={() => setRejectModal(order.id)}>
                          ✕ Refuser
                        </button>
                      )}
                    </div>

                    {order.vendorNote && (
                      <p className={styles.orderNote}>Note : {order.vendorNote}</p>
                    )}

                    <div className={styles.orderDate}>
                      Reçue le {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Gérer ── */}
      {gererModal && (
        <GererModal
          order={gererModal}
          onClose={() => setGererModalId(null)}
          onConfirm={handleConfirm}
          onPrepare={handlePrepare}
          onReady={handleReady}
          onInProgress={handleInProgress}
          onComplete={handleComplete}
          onReject={(id) => { setRejectModal(id); setGererModalId(null); }}
        />
      )}

      {/* ── Modal refus ── */}
      {rejectModal && (
        <div className={styles.modalOverlay} onClick={() => setRejectModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Refuser / Annuler la commande</h3>
            <p>Expliquez au client la raison du refus (facultatif) :</p>
            <textarea
              rows={3}
              placeholder="Ex : Véhicule indisponible à ces dates..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className={styles.rejectTextarea}
            />
            <div className={styles.modalActions}>
              <button className={styles.btnConfirm} onClick={handleReject}>Confirmer le refus</button>
              <button className={styles.btnComplete} onClick={() => setRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
