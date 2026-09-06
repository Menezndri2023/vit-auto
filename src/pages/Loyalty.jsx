import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import LoyaltyTierBadge from "../components/LoyaltyTierBadge/LoyaltyTierBadge";
import styles from "./Loyalty.module.css";

const REASON_LABEL = {
  booking_completed:        "Commande complétée",
  booking_redeemed:         "Points utilisés à la réservation",
  booking_creation_failed:  "Remboursement (réservation annulée)",
  booking_admin_rejected:   "Remboursement (demande refusée)",
};

// Le "reason" d'un bonus de parrainage encode l'id du filleul
// (`referral_<clientId>`, voir bookingController.awardReferralBonusIfEligible)
// pour garantir qu'un même filleul ne peut jamais déclencher deux fois le
// bonus — jamais un libellé fixe à faire correspondre dans REASON_LABEL.
const reasonLabel = (reason) => (reason?.startsWith("referral_") ? "Bonus de parrainage" : REASON_LABEL[reason] || reason);

const TYPE_STYLE = {
  credit:   { emoji: "➕", className: "credit" },
  debit:    { emoji: "➖", className: "debit" },
  rollback: { emoji: "↩️", className: "rollback" },
  referral: { emoji: "🎉", className: "credit" },
};

export default function Loyalty() {
  const { isAuthenticated, authFetch, user } = useAuth();
  const { success: toastSuccess } = useToast();
  const [status,  setStatus]  = useState(null);
  const [tiers,   setTiers]   = useState([]);
  const [history, setHistory] = useState([]);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, tiersRes] = await Promise.all([
        authFetch("/api/loyalty/me"),
        authFetch("/api/loyalty/tiers"),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (tiersRes.ok) setTiers((await tiersRes.json()).tiers || []);
    } catch { /* écran vide affiché par défaut */ }
    setLoading(false);
  }, [authFetch]);

  const loadHistory = useCallback(async (p) => {
    try {
      const res = await authFetch(`/api/loyalty/me/history?page=${p}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.transactions || []);
        setPages(data.pages || 1);
      }
    } catch { /* liste vide affichée par défaut */ }
  }, [authFetch]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadHistory(page); }, [loadHistory, page]);

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: { pathname: "/loyalty" } }} replace />;

  if (loading) return <div className={styles.page}><div className={styles.skeleton} /></div>;

  const tier = status?.tier;
  const nextTier = status?.nextTier;
  const progressPct = nextTier
    ? Math.min(100, Math.round(((status.lifetimePoints - (tier?.minLifetimePoints || 0)) / (nextTier.minLifetimePoints - (tier?.minLifetimePoints || 0))) * 100))
    : 100;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>🎁 Programme de fidélité</h1>
        <p>Cumulez des points à chaque commande et échangez-les contre des réductions.</p>
      </div>

      <div className={styles.statusCard}>
        <div className={styles.statusTop}>
          {tier && <LoyaltyTierBadge tierKey={tier.key} label={tier.label} size="lg" />}
          <div className={styles.balances}>
            <div>
              <strong>{status?.points ?? 0}</strong>
              <span>points disponibles (≈ {((status?.points ?? 0) / 100).toFixed(2)} $ de remise)</span>
            </div>
            <div>
              <strong>{status?.lifetimePoints ?? 0}</strong>
              <span>points cumulés à vie</span>
            </div>
          </div>
        </div>

        {nextTier ? (
          <div className={styles.progressBlock}>
            <div className={styles.progressLabel}>
              Plus que <strong>{status.pointsToNextTier}</strong> points pour atteindre le palier {nextTier.label}
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : (
          <div className={styles.progressLabel}>🏆 Vous avez atteint le palier le plus élevé !</div>
        )}
      </div>

      {user?.referralCode && (
        <div className={styles.statusCard}>
          <div className={styles.progressLabel} style={{ marginBottom: 10 }}>
            🎁 Parrainez un ami — 500 points offerts dès sa première réservation terminée
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <code style={{ background: "#f1f5f9", padding: "8px 14px", borderRadius: 8, fontWeight: 700, letterSpacing: 1 }}>
              {user.referralCode}
            </code>
            <button
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/register?ref=${user.referralCode}`;
                navigator.clipboard?.writeText(link).then(() => toastSuccess("Lien de parrainage copié !"));
              }}
              style={{ background: "#0f1b3f", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}
            >
              📋 Copier le lien de parrainage
            </button>
          </div>
        </div>
      )}

      <h2 className={styles.sectionTitle}>Les paliers</h2>
      <div className={styles.tierGrid}>
        {tiers.map((t) => (
          <div key={t.key} className={`${styles.tierCard} ${t.key === tier?.key ? styles.tierCardActive : ""}`}>
            <LoyaltyTierBadge tierKey={t.key} label={t.label} />
            <p className={styles.tierThreshold}>
              {t.minLifetimePoints === 0 ? "Dès l'inscription" : `À partir de ${t.minLifetimePoints} points cumulés`}
            </p>
            <p className={styles.tierMultiplier}>×{t.multiplier} points par commande</p>
            <ul>
              {t.perks.map((perk) => <li key={perk}>{perk}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Historique des mouvements</h2>
      {history.length === 0 ? (
        <p className={styles.empty}>Aucun mouvement de points pour l'instant.</p>
      ) : (
        <>
          <div className={styles.historyList}>
            {history.map((tx) => {
              const style = TYPE_STYLE[tx.type] || TYPE_STYLE.credit;
              return (
                <div key={tx._id} className={styles.historyRow}>
                  <span className={`${styles.historyIcon} ${styles[style.className]}`}>{style.emoji}</span>
                  <div className={styles.historyInfo}>
                    <strong>{reasonLabel(tx.reason)}</strong>
                    <span>{new Date(tx.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                  </div>
                  <span className={`${styles.historyPoints} ${styles[style.className]}`}>
                    {tx.type === "debit" ? "-" : "+"}{tx.points}
                  </span>
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div className={styles.pagination}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
              <span>Page {page} / {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
