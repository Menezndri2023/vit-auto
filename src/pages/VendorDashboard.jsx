import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { Link, useNavigate } from "react-router-dom";
import styles from "./VendorDashboard.module.css";

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

const COMMISSION_LOCATION = 0.15;
const COMMISSION_VENTE    = 0.03;
const SERVICE_FEE         = 1000;

const STATUS_CONFIG = {
  approved: { label: "Approuvé",   cls: styles.statusApproved },
  pending:  { label: "En attente", cls: styles.statusPending  },
  rejected: { label: "Rejeté",     cls: styles.statusRejected },
};

const BOOKING_STATUS = {
  "À confirmer": { label: "Nouveau",     color: "#f59e0b", bg: "#fffbeb" },
  pending:       { label: "Nouveau",     color: "#f59e0b", bg: "#fffbeb" },
  confirmed:     { label: "Confirmé",   color: "#10b981", bg: "#ecfdf5" },
  in_progress:   { label: "En cours",   color: "#6366f1", bg: "#eef2ff" },
  completed:     { label: "Terminé",    color: "#64748b", bg: "#f8fafc" },
  cancelled:     { label: "Annulé",     color: "#ef4444", bg: "#fef2f2" },
};

const TYPE_LABELS = { location: "Location", essai: "Essai", chauffeur: "Chauffeur" };

export default function VendorDashboard() {
  const { user, isAuthenticated, token } = useAuth();
  const { partnerVehicles: myVehicles, bookings, updateBookingStatus, loadPartnerVehicles } = useVehicles();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]         = useState("annonces"); // "annonces" | "commandes"
  const [subscription, setSubscription]   = useState(null);
  const [subLoading, setSubLoading]       = useState(true);
  const [boostTarget, setBoostTarget]     = useState(null);
  const [boostMsg, setBoostMsg]           = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [orderFilter, setOrderFilter]     = useState("all");
  const [rejectModal, setRejectModal]     = useState(null); // { bookingId }
  const [rejectNote, setRejectNote]       = useState("");

  useEffect(() => {
    if (!isAuthenticated || !token) { setSubLoading(false); return; }
    fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubscription(d.subscription))
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [isAuthenticated, token]);

  // Commandes qui concernent les véhicules du vendeur
  const myVehicleIds = useMemo(
    () => new Set(myVehicles.map((v) => String(v.id || v._id))),
    [myVehicles]
  );

  const myOrders = useMemo(
    () => bookings.filter((b) => myVehicleIds.has(String(b.vehicleId))),
    [bookings, myVehicleIds]
  );

  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return myOrders;
    const map = { new: ["À confirmer", "pending"], confirmed: ["confirmed"], done: ["completed", "in_progress"], cancelled: ["cancelled"] };
    return myOrders.filter((b) => (map[orderFilter] || []).includes(b.status));
  }, [myOrders, orderFilter]);

  const stats = useMemo(() => {
    const approved = myVehicles.filter((v) => v.status === "approved");
    const locationV = approved.filter((v) => v.mode === "Louer" || v.mode === "location");
    const venteV    = approved.filter((v) => v.mode === "Vendre" || v.mode === "vente");
    const grossLoc  = locationV.reduce((s, v) => s + (v.pricePerDay || 0) * 7, 0);
    const commLoc   = Math.round(grossLoc * COMMISSION_LOCATION);
    const grossVte  = venteV.reduce((s, v) => s + (v.buyPrice || 0), 0) * 0.1;
    const commVte   = Math.round(grossVte * COMMISSION_VENTE);
    const netRev    = Math.max(grossLoc + grossVte - commLoc - commVte - SERVICE_FEE * approved.length, 0);
    const newOrders = myOrders.filter((b) => b.status === "À confirmer" || b.status === "pending").length;
    return {
      total: myVehicles.length,
      approved: approved.length,
      pending:  myVehicles.filter((v) => v.status === "pending" || !v.status).length,
      rejected: myVehicles.filter((v) => v.status === "rejected").length,
      netRev, newOrders,
    };
  }, [myVehicles, myOrders]);

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
    } catch {}
    loadPartnerVehicles(); // Refresh from server
  };

  const handleConfirm = (bookingId) => updateBookingStatus(bookingId, "confirmed");
  const handleComplete = (bookingId) => updateBookingStatus(bookingId, "completed");
  const handleReject = () => {
    if (!rejectModal) return;
    updateBookingStatus(rejectModal, "cancelled", rejectNote);
    setRejectModal(null);
    setRejectNote("");
  };

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
      {/* ── Header ──────────────────────────── */}
      <header className={styles.header}>
        <div>
          <h1>Espace Partenaire</h1>
          <p>Bienvenue {user.firstName || user.name} — gérez vos annonces et commandes</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/plans" className={`${styles.actionBtn} ${styles.viewBtn}`} style={{ padding: "0.75rem 1.25rem" }}>Tarifs</Link>
          <Link to="/vendor" className={`${styles.actionBtn} ${styles.editBtn}`} style={{ padding: "0.75rem 1.25rem" }}>+ Nouvelle annonce</Link>
        </div>
      </header>

      {/* ── Plan banner ─────────────────────── */}
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

      {/* ── Commission info ─────────────────── */}
      <div className={styles.commissionBanner}>
        <div className={styles.commItem}><span>Commission location</span><strong>15 %</strong></div>
        <div className={styles.commItem}><span>Commission vente</span><strong>3 %</strong></div>
        <div className={styles.commItem}><span>Frais de service</span><strong>1 000 FCFA / réservation</strong></div>
        <div className={styles.commItem} style={{ borderLeft: "2px solid #10b981" }}>
          <span>Revenus nets estimés / semaine</span>
          <strong style={{ color: "#10b981" }}>{fmt(stats.netRev)}</strong>
        </div>
      </div>

      {/* ── Stats ───────────────────────────── */}
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
          <span className={styles.statNumber}>{myOrders.length}</span>
          <span className={styles.statLabel}>Commandes reçues</span>
          {stats.newOrders > 0 && (
            <span className={styles.newBadge}>{stats.newOrders} nouveau{stats.newOrders > 1 ? "x" : ""}</span>
          )}
        </div>
      </div>

      {/* ── Boost message ───────────────────── */}
      {boostMsg && (
        <div className={styles.boostMessage}>
          {boostMsg}
          <button onClick={() => setBoostMsg("")} style={{ marginLeft: "1rem", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* ── Onglets ─────────────────────────── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "annonces" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("annonces")}
        >
          Mes annonces ({myVehicles.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "commandes" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("commandes")}
        >
          Commandes ({myOrders.length})
          {stats.newOrders > 0 && <span className={styles.tabBadge}>{stats.newOrders}</span>}
        </button>
      </div>

      {/* ══════════════════════════════════════ */}
      {/* TAB ANNONCES                           */}
      {/* ══════════════════════════════════════ */}
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
                const vid    = vehicle.id || vehicle._id;
                const status = STATUS_CONFIG[vehicle.status || "pending"];
                const isBoosted = subscription?.boosts?.some((b) => b.isActive && String(b.vehicle) === String(vid));
                const commRate  = (vehicle.mode === "Louer" || vehicle.mode === "location") ? COMMISSION_LOCATION : COMMISSION_VENTE;
                const priceLabel = vehicle.pricePerDay ? `${fmt(vehicle.pricePerDay)} / jour` : vehicle.buyPrice ? fmt(vehicle.buyPrice) : "—";
                const netLabel   = vehicle.pricePerDay ? `Net : ${fmt(Math.round(vehicle.pricePerDay * (1 - commRate) - SERVICE_FEE / 30))} / jour` : "—";
                const orderCount = myOrders.filter((b) => String(b.vehicleId) === String(vid)).length;

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

                    {/* Barre de score + feedback pour annonces non approuvées */}
                    {vehicle.validationScore != null && (vehicle.status === "pending" || vehicle.status === "rejected") && (
                      <div className={styles.validationBlock}>
                        <div className={styles.scoreBarWrap}>
                          <div
                            className={styles.scoreBarFill}
                            style={{
                              width: `${vehicle.validationScore}%`,
                              background: vehicle.validationScore >= 65 ? "#10b981" : vehicle.validationScore >= 40 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        {vehicle.validationErrors?.length > 0 && (
                          <ul className={styles.validErrList}>
                            {vehicle.validationErrors.map((e, i) => (
                              <li key={i} className={styles.validErrItem}>❌ {e}</li>
                            ))}
                          </ul>
                        )}
                        {vehicle.validationWarnings?.length > 0 && (
                          <ul className={styles.validWarnList}>
                            {vehicle.validationWarnings.slice(0, 3).map((w, i) => (
                              <li key={i} className={styles.validWarnItem}>⚠️ {w}</li>
                            ))}
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
                      <button
                        className={styles.orderHintBtn}
                        onClick={() => { setActiveTab("commandes"); setOrderFilter("all"); }}
                      >
                        {orderCount} commande{orderCount > 1 ? "s" : ""} →
                      </button>
                    )}
                    <p className={styles.vehicleDescription}>{vehicle.description || "Pas de description disponible"}</p>
                    <div className={styles.cardActions}>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`}>Modifier</button>
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
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* TAB COMMANDES                          */}
      {/* ══════════════════════════════════════ */}
      {activeTab === "commandes" && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Commandes reçues ({filteredOrders.length})</h2>
            <select className={styles.filterSelect} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              <option value="new">Nouveaux</option>
              <option value="confirmed">Confirmés</option>
              <option value="done">En cours / Terminés</option>
              <option value="cancelled">Annulés</option>
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
                const bst    = BOOKING_STATUS[order.status] || BOOKING_STATUS.pending;
                const typeLabel = TYPE_LABELS[order.type] || order.type;
                const isNew  = order.status === "À confirmer" || order.status === "pending";
                const isDone = order.status === "completed" || order.status === "cancelled";

                return (
                  <div key={order.id} className={`${styles.orderCard} ${isNew ? styles.orderCardNew : ""}`}>
                    {/* En-tête */}
                    <div className={styles.orderHeader}>
                      <div className={styles.orderTitle}>
                        <span className={styles.orderType}>{typeLabel}</span>
                        <strong>{order.vehicleName}</strong>
                      </div>
                      <span className={styles.orderStatus} style={{ background: bst.bg, color: bst.color }}>
                        {bst.label}
                      </span>
                    </div>

                    {/* Infos client */}
                    <div className={styles.orderGrid}>
                      <div className={styles.orderInfo}>
                        <span>Client</span>
                        <strong>{order.firstName} {order.lastName}</strong>
                      </div>
                      <div className={styles.orderInfo}>
                        <span>Contact</span>
                        <strong>{order.phone || order.email}</strong>
                      </div>
                      {order.type === "location" && (
                        <>
                          <div className={styles.orderInfo}>
                            <span>Période</span>
                            <strong>{order.startDate} → {order.endDate} ({order.days}j)</strong>
                          </div>
                          <div className={styles.orderInfo}>
                            <span>Lieu de prise en charge</span>
                            <strong>{order.pickupLocation || "—"}</strong>
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
                            <strong>{order.preferredDate} à {order.preferredTime}</strong>
                          </div>
                          <div className={styles.orderInfo}>
                            <span>Notes</span>
                            <strong>{order.notes || "Aucune"}</strong>
                          </div>
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
                        <strong>{order.paidWith === "card" ? "Carte bancaire" : order.paidWith || "—"}</strong>
                      </div>
                    </div>

                    {/* Actions */}
                    {!isDone && (
                      <div className={styles.orderActions}>
                        {isNew && (
                          <button className={styles.btnConfirm} onClick={() => handleConfirm(order.id)}>
                            ✓ Accepter la commande
                          </button>
                        )}
                        {order.status === "confirmed" && (
                          <button className={styles.btnComplete} onClick={() => handleComplete(order.id)}>
                            Marquer terminé
                          </button>
                        )}
                        <button className={styles.btnReject} onClick={() => setRejectModal(order.id)}>
                          ✕ Refuser / Annuler
                        </button>
                      </div>
                    )}

                    {/* Note vendeur si refusé */}
                    {order.vendorNote && (
                      <p className={styles.orderNote}>Note : {order.vendorNote}</p>
                    )}

                    <div className={styles.orderDate}>
                      Reçue le {new Date(order.id).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modal refus ─────────────────────── */}
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
