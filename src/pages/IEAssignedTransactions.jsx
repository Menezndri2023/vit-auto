import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./IEClientDashboard.module.css";

// Dashboard du transitaire/agent assigné (restructuration logistique
// Import/Export, 2026-09) — distinct de IEClientDashboard (l'acheteur) et
// d'ImporterDashboard (le vendeur/partenaire de l'annonce) : un transitaire
// externe n'est ni l'un ni l'autre, seulement la personne à qui la logistique
// de CE dossier précis a été confiée (voir IETransaction.assignment côté
// serveur). Réutilise le même module CSS que IEClientDashboard — même
// famille de pages, aucun style dédié nécessaire.

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_CFG = {
  in_escrow:  { label: "Fonds sécurisés — à préparer", icon: "🔒", color: "#059669", bg: "#ecfdf5" },
  preparing:  { label: "Préparation export",           icon: "📦", color: "#6366f1", bg: "#f0f4ff" },
  shipped:    { label: "Expédié",                      icon: "🚢", color: "#2563eb", bg: "#eff6ff" },
  in_transit: { label: "En transit",                   icon: "🌍", color: "#2563eb", bg: "#eff6ff" },
  delivered:  { label: "Livré",                        icon: "📬", color: "#d97706", bg: "#fffbeb" },
  completed:  { label: "Terminé",                      icon: "⭐", color: "#94a3b8", bg: "#f1f5f9" },
};

function AssignedCard({ tx }) {
  const cfg = STATUS_CFG[tx.status] || { label: tx.status, icon: "📋", color: "#64748b", bg: "#f8fafc" };
  const needsInspection = tx.documents?.inspectionDocs?.status === "en_attente";

  return (
    <Link to={`/import-export/transaction/${tx._id}`} className={styles.txCard}>
      <div className={styles.txImg}>
        {tx.listing?.mainPhoto ? <img src={tx.listing.mainPhoto} alt="" loading="lazy" decoding="async" /> : <span>🚗</span>}
        {needsInspection && <div className={styles.urgentBadge}>Inspection requise</div>}
      </div>

      <div className={styles.txBody}>
        <div className={styles.txTop}>
          <p className={styles.txTitle}>{tx.listing?.title || "Véhicule"}</p>
          <span className={styles.txStatus} style={{ color: cfg.color, background: cfg.bg }}>{cfg.icon} {cfg.label}</span>
        </div>

        <p className={styles.txMeta}>
          {tx.listing?.make} {tx.listing?.model} {tx.listing?.year}
          {tx.listing?.sourceCountry && <> · 🌍 {tx.listing.sourceCountry}</>}
          {tx.destCountry && <> → {tx.destCountry}</>}
        </p>

        <div className={styles.txFooter}>
          <div className={styles.txPartner}>
            <span>{tx.client?.firstName?.[0] || ""}{tx.client?.lastName?.[0] || ""}</span>
            <p>{tx.client?.firstName} {tx.client?.lastName} (client)</p>
          </div>
          <div className={styles.txRight}>
            <span className={styles.txDate}>{fmtDate(tx.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function IEAssignedTransactions() {
  const { token } = useAuth();
  const navigate   = useNavigate();

  const [txList,  setTxList]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [total,   setTotal]   = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import-export/transactions/assigned?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const d = await res.json();
      setTxList(d.transactions || []);
      setTotal(d.total || 0);
    } catch (err) {
      console.error("IEAssignedTransactions:", err);
      setError("Impossible de charger vos dossiers assignés. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) { navigate("/login", { state: { from: { pathname: "/import-export/assigned" } } }); return; }
    load();
  }, [load, token, navigate]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mes dossiers assignés</h1>
          <p className={styles.sub}>Transactions Import/Export dont la logistique vous a été confiée (transitaire ou agent VIT AUTO).</p>
        </div>
      </div>

      {error && (
        <div className={styles.urgentAlert} style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
          <span>⚠️</span>
          <div>
            <strong style={{ color: "#dc2626" }}>Erreur de chargement</strong>
            <p style={{ color: "#991b1b" }}>{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.grid}>
          {[...Array(3)].map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : txList.length === 0 ? (
        <div className={styles.empty}>
          <span>📦</span>
          <h3>Aucun dossier assigné pour le moment</h3>
          <p>Vous serez notifié dès qu'une transaction vous sera confiée.</p>
        </div>
      ) : (
        <>
          <p className={styles.count}>{total} dossier{total > 1 ? "s" : ""}</p>
          <div className={styles.grid}>
            {txList.map((tx) => <AssignedCard key={tx._id} tx={tx} />)}
          </div>
        </>
      )}
    </div>
  );
}
