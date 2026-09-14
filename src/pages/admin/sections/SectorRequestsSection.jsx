import { useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";
import { fmtDate } from "../shared.jsx";
import { SECTEUR_LABELS, ACTIVITY_LABELS } from "../../../constants/partnerTaxonomy";

// ── Demandes d'ajout de secteur d'activité ─────────────────────────────────
//
// Un partenaire loueur qui veut aussi vendre, un vendeur qui veut exporter :
// le secteur s'ajoute ici, sur décision de l'administration, avec sous les
// yeux ce que le compte porte déjà (secteurs, type d'entité, KYC,
// certification). Le nombre de secteurs cumulables dépend du plan — le
// serveur le revérifie à l'approbation et le refus s'affiche tel quel.
// Autonome : charge ses données lui-même (GET /api/partner-sectors/admin/requests).

const STATUTS = [
  { id: "pending",  label: "En attente" },
  { id: "approved", label: "Accordées" },
  { id: "rejected", label: "Refusées" },
];

export function SectorRequestsSection({ headers, onCountChange }) {
  const [statut, setStatut]     = useState("pending");
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [erreur, setErreur]     = useState("");
  const [enCours, setEnCours]   = useState(null);
  const [notes, setNotes]       = useState({});

  const charger = async (s = statut) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/partner-sectors/admin/requests?status=${s}`, { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Chargement impossible.");
      setDemandes(d.demandes || []);
      setErreur("");
      if (s === "pending") onCountChange?.((d.demandes || []).length);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge au changement de filtre uniquement
  useEffect(() => { charger(statut); }, [statut]);

  const traiter = async (id, decision) => {
    setEnCours(id);
    setErreur("");
    try {
      const r = await fetch(`/api/partner-sectors/admin/requests/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Action refusée.");
      await charger(statut);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(null);
    }
  };

  const nom = (u) => u?.business?.companyName || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.email || "—";
  const secteursActuels = (u) => [...new Set([u?.partnerActivity, ...(u?.partnerActivities || [])].filter(Boolean))];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {STATUTS.map((s) => (
          <button key={s.id} type="button" onClick={() => setStatut(s.id)} className={styles.btnRefresh}
            style={{ background: statut === s.id ? "#0f1b3f" : "#fff", color: statut === s.id ? "#fff" : "#334155", border: "1.5px solid #e2e8f0" }}>
            {s.label}
          </button>
        ))}
      </div>

      {erreur && <p style={{ color: "#dc2626", fontSize: ".85rem" }}>{erreur}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🧭</div>
          <p style={{ fontWeight: 600 }}>Aucune demande {STATUTS.find((s) => s.id === statut)?.label.toLowerCase()}.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {demandes.map((d) => (
            <div key={d._id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#0f1b3f" }}>{nom(d.user)} <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: ".8rem" }}>· {d.user?.email}</span></div>
                  <div style={{ fontSize: ".82rem", color: "#334155", marginTop: 4 }}>
                    Demande le secteur <strong>{SECTEUR_LABELS[d.secteur] || d.secteur}</strong> — {ACTIVITY_LABELS[d.secteur]}
                  </div>
                  <div style={{ fontSize: ".76rem", color: "#64748b", marginTop: 4 }}>
                    Secteurs actuels : {secteursActuels(d.user).map((s) => SECTEUR_LABELS[s] || s).join(", ") || "aucun"} ·
                    Entité : {d.user?.entityType || "—"} · KYC : {d.user?.kycStatus || "—"} · Certification : {d.user?.certificationBadge || "—"} · {d.user?.country || "—"}
                  </div>
                  {d.motif && <div style={{ fontSize: ".82rem", color: "#334155", marginTop: 6, fontStyle: "italic" }}>« {d.motif} »</div>}
                  <div style={{ fontSize: ".74rem", color: "#94a3b8", marginTop: 4 }}>
                    Déposée le {fmtDate(d.createdAt)}
                    {d.reviewedAt && <> · traitée le {fmtDate(d.reviewedAt)} par {nom(d.reviewedBy)}</>}
                    {d.note && <> · note : {d.note}</>}
                  </div>
                </div>
                {d.status === "pending" && (
                  <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
                    <input
                      value={notes[d._id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [d._id]: e.target.value.slice(0, 1000) }))}
                      placeholder="Note (montrée au partenaire si refus)"
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".8rem" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" disabled={enCours === d._id} onClick={() => traiter(d._id, "approve")}
                        style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#d1fae5", color: "#047857", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                        ✓ Accorder
                      </button>
                      <button type="button" disabled={enCours === d._id} onClick={() => traiter(d._id, "reject")}
                        style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                        ✗ Refuser
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
