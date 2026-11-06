import { PLAN_TIER_LABELS } from "../shared.jsx";
import { PaymentsSection } from "./PaymentsSection.jsx";
import styles from "../../AdminPanel.module.css";
import { CheckCircle2, CreditCard, Ticket, XCircle, Gift } from "lucide-react";

// Onglet « Paiements » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function PaiementsSection({
  accorderEssai, chercherPartenaireEssai, essaiPalier, essaiRecherche, essaiResultats, essaiRetour,
  essaiVendeur, fmtUSD, headers, loadSubRequests, setEssaiPalier, setEssaiResultats,
  setEssaiVendeur, subAction, subActioning, subLoading, subRequests,
}) {
  return (
    <div className={styles.tabContent}>
      <PaymentsSection headers={headers} />
      <div className={styles.uiEnteteSection}>
        <h2 className={styles.uiTitre}>
          <CreditCard size={16} aria-hidden="true" /> Abonnements Pro & Mises en avant — confirmation de paiement
        </h2>
        <button className={styles.btnRefresh} onClick={loadSubRequests}>↻ Actualiser</button>
      </div>

      {/* ── Essai gratuit ────────────────────────────────────────────
          Un palier que personne n'a jamais vu fonctionner ne se vend pas.
          L'essai n'exige aucune plomberie de paiement : l'activation passe
          déjà par une confirmation manuelle. */}
      <div className={styles.chartCard} style={{ marginBottom: 20 }}>
        <h3 className={styles.chartTitle}><Gift size={16} aria-hidden="true" /> Accorder un essai gratuit de 30 jours</h3>
        <p style={{ margin: "0 0 12px", fontSize: ".83rem", color: "#64748b" }}>
          Un seul essai par compte, pour toujours. Refusé si le partenaire a déjà un abonnement actif.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 260px", position: "relative" }}>
            <input
              value={essaiVendeur ? `${[essaiVendeur.firstName, essaiVendeur.lastName].filter(Boolean).join(" ")} — ${essaiVendeur.email || essaiVendeur.phone || ""}` : essaiRecherche}
              onChange={(e) => chercherPartenaireEssai(e.target.value)}
              placeholder="Rechercher un partenaire (nom ou e-mail)…"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: ".88rem", boxSizing: "border-box" }}
            />
            {essaiResultats.length > 0 && !essaiVendeur && (
              <ul style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, margin: "4px 0 0", padding: 0, listStyle: "none", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,27,63,.12)", maxHeight: 220, overflowY: "auto" }}>
                {essaiResultats.map((u) => (
                  <li key={u._id}>
                    <button type="button"
                      onClick={() => { setEssaiVendeur(u); setEssaiResultats([]); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "none", cursor: "pointer", fontSize: ".85rem" }}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ")} — {u.email || u.phone || "sans contact"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select value={essaiPalier} onChange={(e) => setEssaiPalier(e.target.value)}
            style={{ padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: ".88rem" }}>
            <option value="individuel_plus">Individuel Plus</option>
            <option value="business">Business</option>
            <option value="exportateur">Exportateur</option>
          </select>
          <button disabled={!essaiVendeur} onClick={accorderEssai}
            style={{ background: essaiVendeur ? "#16a34a" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: essaiVendeur ? "pointer" : "not-allowed", fontWeight: 700, fontSize: ".85rem" }}>
            Accorder l'essai
          </button>
        </div>
        {essaiRetour && (
          <p style={{ margin: "12px 0 0", fontSize: ".85rem", color: essaiRetour.ok ? "#16a34a" : "#dc2626" }}>
            {essaiRetour.message}
          </p>
        )}
      </div>

      {subLoading ? (
        <p style={{ color: "#64748b" }}>Chargement…</p>
      ) : subRequests.length === 0 ? (
        <p style={{ color: "#64748b" }}>Aucune demande en attente de confirmation.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {subRequests.map((sub) => {
            const pendingPayments = (sub.paymentHistory || []).filter((p) => p.status === "pending");
            const pendingBoosts   = (sub.boosts || []).filter((b) => !b.isActive);
            if (!pendingPayments.length && !pendingBoosts.length) return null;
            return (
              <div key={sub._id} className={styles.chartCard}>
                <h3 className={styles.chartTitle}>
                  {sub.vendor?.firstName} {sub.vendor?.lastName} — {sub.vendor?.email}
                </h3>
                {pendingPayments.map((p) => (
                  <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                    <div style={{ fontSize: ".88rem" }}>
                      <strong>{PLAN_TIER_LABELS[p.planTier] || p.planTier}</strong> — {fmtUSD(p.amount)} · {p.method} · période {p.period}
                      {p.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}><Ticket size={16} aria-hidden="true" /> {p.promoCode}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className={styles.btnPrimary}
                        disabled={subActioning === `${sub._id}:${p._id}`}
                        onClick={() => subAction(`plan/${p._id}/approve`, sub._id, p._id)}
                      ><CheckCircle2 size={16} aria-hidden="true" /> Confirmer le paiement</button>
                      <button
                        className={styles.btnDanger}
                        disabled={subActioning === `${sub._id}:${p._id}`}
                        onClick={() => subAction(`plan/${p._id}/reject`, sub._id, p._id)}
                      ><XCircle size={16} aria-hidden="true" /> Rejeter</button>
                    </div>
                  </div>
                ))}
                {pendingBoosts.map((b) => (
                  <div key={b._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                    <div style={{ fontSize: ".88rem" }}>
                      <strong>Mise en avant ({b.tier})</strong> — véhicule #{String(b.vehicle).slice(-6)} · {fmtUSD(b.priceUSD)}
                      {b.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}><Ticket size={16} aria-hidden="true" /> {b.promoCode}</span>}
                    </div>
                    <button
                      className={styles.btnPrimary}
                      disabled={subActioning === `${sub._id}:${b._id}`}
                      onClick={() => subAction(`boost/${b._id}/approve`, sub._id, b._id)}
                    ><CheckCircle2 size={16} aria-hidden="true" /> Confirmer le paiement</button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
