import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./IEClientDashboard.module.css";

const fmtPrice = (p, c = "EUR") =>
  p != null ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_CFG = {
  reserved:             { label: "Réservation en attente", icon: "📋", color: "#2563eb",  bg: "#eff6ff" },
  confirmed:            { label: "Confirmé",               icon: "✅", color: "#059669",  bg: "#ecfdf5" },
  in_discussion:        { label: "En discussion",          icon: "💬", color: "#6366f1",  bg: "#f0f4ff" },
  inspection_requested: { label: "Inspection demandée",    icon: "🔍", color: "#d97706",  bg: "#fffbeb" },
  inspection_done:      { label: "Inspection terminée",    icon: "🔍", color: "#059669",  bg: "#ecfdf5" },
  offer_sent:           { label: "Offre reçue",            icon: "📄", color: "#9333ea",  bg: "#fdf4ff" },
  offer_accepted:       { label: "Offre acceptée",         icon: "🤝", color: "#9333ea",  bg: "#fdf4ff" },
  payment_pending:      { label: "Paiement requis",        icon: "💳", color: "#ea580c",  bg: "#fff7ed" },
  payment_submitted:    { label: "Paiement en vérification", icon: "⏳", color: "#d97706", bg: "#fffbeb" },
  in_escrow:            { label: "Fonds sécurisés",        icon: "🔒", color: "#059669",  bg: "#ecfdf5" },
  preparing:            { label: "Préparation export",     icon: "📦", color: "#6366f1",  bg: "#f0f4ff" },
  shipped:              { label: "Expédié",                icon: "🚢", color: "#2563eb",  bg: "#eff6ff" },
  in_transit:           { label: "En transit",             icon: "🌍", color: "#2563eb",  bg: "#eff6ff" },
  delivered:            { label: "Livré — Confirmer",      icon: "📬", color: "#d97706",  bg: "#fffbeb" },
  funds_released:       { label: "Fonds libérés",          icon: "💰", color: "#059669",  bg: "#ecfdf5" },
  completed:            { label: "Terminé",                icon: "⭐", color: "#d97706",  bg: "#fffbeb" },
  disputed:             { label: "Litige en cours",        icon: "⚠️", color: "#dc2626",  bg: "#fef2f2" },
  cancelled:            { label: "Annulée",                icon: "❌", color: "#94a3b8",  bg: "#f1f5f9" },
};

const URGENCY = ["offer_sent", "payment_pending", "delivered"];

function TxCard({ tx }) {
  const cfg = STATUS_CFG[tx.status] || { label: tx.status, icon: "📋", color: "#64748b", bg: "#f8fafc" };
  const isUrgent = URGENCY.includes(tx.status);

  return (
    <Link to={`/import-export/transaction/${tx._id}`} className={`${styles.txCard} ${isUrgent ? styles.txCardUrgent : ""}`}>
      <div className={styles.txImg}>
        {tx.listing?.mainPhoto
          ? <img src={tx.listing.mainPhoto} alt="" />
          : <span>🚗</span>
        }
        {isUrgent && <div className={styles.urgentBadge}>Action requise</div>}
      </div>

      <div className={styles.txBody}>
        <div className={styles.txTop}>
          <p className={styles.txTitle}>{tx.listing?.title || "Véhicule"}</p>
          <span className={styles.txStatus} style={{ color: cfg.color, background: cfg.bg }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        <p className={styles.txMeta}>
          {tx.listing?.make} {tx.listing?.model} {tx.listing?.year}
          {tx.listing?.sourceCountry && <> · 🌍 {tx.listing.sourceCountry}</>}
          {tx.destCountry && <> → {tx.destCountry}</>}
        </p>

        <div className={styles.txFooter}>
          <div className={styles.txPartner}>
            {tx.partner?.profilePhoto
              ? <img src={tx.partner.profilePhoto} alt="" />
              : <span>{tx.partner?.firstName?.[0] || ""}{tx.partner?.lastName?.[0] || ""}</span>
            }
            <p>{tx.partner?.firstName} {tx.partner?.lastName}</p>
          </div>

          <div className={styles.txRight}>
            {tx.finalOffer?.totalAmount
              ? <span className={styles.txPrice}>{fmtPrice(tx.finalOffer.totalAmount, tx.finalOffer.currency)}</span>
              : <span className={styles.txPriceRef}>{fmtPrice(tx.listing?.price, tx.listing?.currency)}</span>
            }
            <span className={styles.txDate}>{fmtDate(tx.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function IEClientDashboard() {
  const { user, token } = useAuth();
  const navigate        = useNavigate();

  const [txList,   setTxList]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page, limit: 12 });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/import-export/transactions/mine?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const d = await res.json();
      setTxList(d.transactions || []);
      setTotal(d.total || 0);
    } catch (err) {
      console.error("IEClientDashboard:", err);
      setError("Impossible de charger vos transactions. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, token]);

  useEffect(() => {
    if (!token) { navigate("/login", { state: { from: { pathname: "/import-export/dashboard" } } }); return; }
    load();
  }, [load, token, navigate]);

  const filterGroups = [
    { value: "all",          label: "Toutes" },
    { value: "reserved",     label: "En attente" },
    { value: "offer_sent",   label: "Offres reçues" },
    { value: "payment_pending", label: "Paiement" },
    { value: "in_transit",   label: "En transit" },
    { value: "delivered",    label: "Livrés" },
    { value: "completed",    label: "Terminés" },
  ];

  const urgentCount = txList.filter((t) => URGENCY.includes(t.status)).length;

  return (
    <div className={styles.page}>
      {/* ── En-tête ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mes transactions import</h1>
          <p className={styles.sub}>Suivez toutes vos transactions d'achat import/export</p>
        </div>
        <Link to="/import-export/listings" className={styles.btnPrimary}>
          + Rechercher un véhicule
        </Link>
      </div>

      {/* ── Alerte actions requises ── */}
      {urgentCount > 0 && (
        <div className={styles.urgentAlert}>
          <span>⚡</span>
          <div>
            <strong>{urgentCount} action{urgentCount > 1 ? "s" : ""} requise{urgentCount > 1 ? "s" : ""}</strong>
            <p>Des transactions nécessitent votre attention (offre à valider, paiement, livraison à confirmer).</p>
          </div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div className={styles.filters}>
        {filterGroups.map((g) => (
          <button
            key={g.value}
            className={`${styles.filterBtn} ${filter === g.value ? styles.filterBtnActive : ""}`}
            onClick={() => { setFilter(g.value); setPage(1); }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* ── Erreur de chargement ── */}
      {error && (
        <div className={styles.urgentAlert} style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
          <span>⚠️</span>
          <div>
            <strong style={{ color: "#dc2626" }}>Erreur de chargement</strong>
            <p style={{ color: "#991b1b" }}>{error}</p>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      {loading ? (
        <div className={styles.grid}>
          {[...Array(4)].map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : txList.length === 0 ? (
        <div className={styles.empty}>
          <span>🌍</span>
          <h3>{filter === "all" ? "Aucune transaction" : "Aucune transaction dans cette catégorie"}</h3>
          <p>Parcourez nos annonces de véhicules import et réservez gratuitement.</p>
          <Link to="/import-export/listings" className={styles.btnPrimary}>Voir les annonces</Link>
        </div>
      ) : (
        <>
          <p className={styles.count}>{total} transaction{total > 1 ? "s" : ""}</p>
          <div className={styles.grid}>
            {txList.map((tx) => <TxCard key={tx._id} tx={tx} />)}
          </div>

          {total > 12 && (
            <div className={styles.pagination}>
              {page > 1 && <button className={styles.pageBtn} onClick={() => setPage((p) => p - 1)}>← Précédent</button>}
              <span>Page {page} / {Math.ceil(total / 12)}</span>
              {page < Math.ceil(total / 12) && <button className={styles.pageBtn} onClick={() => setPage((p) => p + 1)}>Suivant →</button>}
            </div>
          )}
        </>
      )}

      {/* ── CTA bas de page ── */}
      <div className={styles.bottomCta}>
        <div>
          <h3>Comment fonctionne le processus ?</h3>
          <p>De la réservation à la livraison, VIT AUTO sécurise chaque étape de votre transaction import.</p>
        </div>
        <Link to="/import-export" className={styles.btnGhost}>En savoir plus →</Link>
      </div>
    </div>
  );
}
