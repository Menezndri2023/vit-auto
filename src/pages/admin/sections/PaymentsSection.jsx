// Tous les paiements (2026-10-06) — affiché en tête de l'onglet « Paiements ».
// Il n'existait aucune liste : l'argent encaissé, échoué ou remboursé n'était
// visible que commande par commande. Source : GET /api/payments/admin/list
// (paymentController.adminListPayments), paginée. Les paiements Import/Export
// (séquestre) restent dans l'onglet Escrow.
import { useCallback, useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";
import { fmtDate } from "../shared.jsx";

const STATUTS = {
  pending:            { label: "En attente",          color: "#d97706" },
  completed:          { label: "Encaissé",            color: "#059669" },
  failed:             { label: "Échoué",              color: "#dc2626" },
  refunded:           { label: "Remboursé",           color: "#64748b" },
  partially_refunded: { label: "Remboursé en partie", color: "#64748b" },
};
const METHODES = { card: "Carte", orange_money: "Orange Money", wave: "Wave", mtn: "MTN", moov: "Moov", paypal: "PayPal", applepay: "Apple Pay", cash: "Espèces", virement: "Virement", test: "Test" };

const cible = (p) => {
  if (p.booking) return `${p.booking.reference || "Réservation"} · ${p.booking.type || ""}${p.booking.status === "cancelled" ? " · ANNULÉE" : ""}`;
  if (p.serviceRequest) return `Service · ${p.serviceRequest.category || ""}`;
  if (p.insuranceRequest) return "Assurance";
  return "—";
};

export function PaymentsSection({ headers }) {
  const [liste, setListe] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState("");
  const [parStatut, setParStatut] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try {
      const q = new URLSearchParams({ page: String(page), limit: "50" });
      if (statut) q.set("status", statut);
      const r = await fetch(`/api/payments/admin/list?${q}`, { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
      setListe(d.payments || []); setTotal(d.total || 0); setPages(d.pages || 1); setParStatut(d.parStatut || []);
    } catch (e) { setErreur(e.message); } finally { setChargement(false); }
  }, [headers, page, statut]);
  useEffect(() => { charger(); }, [charger]);

  const encaisse = parStatut.filter((x) => x._id?.status === "completed");

  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>💳 Tous les paiements ({total})</h2>
          <p style={{ margin: 0, fontSize: ".82rem", color: "#64748b" }}>
            Réservations, devis de service et assurances. Import/Export : onglet Escrow.
            {encaisse.length > 0 && <> Encaissé : {encaisse.map((x) => `${Math.round(x.montant).toLocaleString("fr-FR")} ${x._id.devise}`).join(" · ")}.</>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }} aria-label="Statut du paiement"
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".8rem", minHeight: 36 }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className={styles.btnRefresh} onClick={charger}>↻ Actualiser</button>
        </div>
      </div>

      {erreur && <p style={{ color: "#dc2626" }}>Liste indisponible : {erreur}</p>}
      {chargement ? <p style={{ color: "#64748b" }}>Chargement…</p> : liste.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: ".88rem" }}>Aucun paiement{statut ? " pour ce statut" : ""}.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ width: "100%", fontSize: ".82rem" }}>
            <thead><tr><th>Date</th><th>Objet</th><th>Montant</th><th>Moyen</th><th>Statut</th><th>Réf. fournisseur</th></tr></thead>
            <tbody>
              {liste.map((p) => {
                const s = STATUTS[p.status] || { label: p.status, color: "#64748b" };
                return (
                  <tr key={p._id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(p.createdAt)}</td>
                    <td>{cible(p)}</td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                      {Number(p.amount || 0).toLocaleString("fr-FR")} {p.devise}
                      {p.refundedAmount > 0 && <div style={{ color: "#64748b", fontWeight: 500 }}>remboursé : {p.refundedAmount.toLocaleString("fr-FR")}</div>}
                    </td>
                    <td>{METHODES[p.method] || p.method}{p.simulated ? " (simulé)" : ""}</td>
                    <td style={{ color: s.color, fontWeight: 700 }}>{s.label}</td>
                    <td style={{ fontSize: ".75rem", color: "#64748b", overflowWrap: "anywhere" }}>{p.transactionId || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 }}>
          <button className={styles.btnRefresh} disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>← Précédent</button>
          <span style={{ fontSize: ".82rem", color: "#64748b" }}>Page {page} / {pages}</span>
          <button className={styles.btnRefresh} disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}
