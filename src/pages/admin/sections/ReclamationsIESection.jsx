import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate } from "../shared.jsx";
import LitigesTransaction from "../../../components/LitigesConditions/LitigesTransaction";
import { Scale } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Réclamations en cours (2026-10-31 ; réservations et logistique le 2026-11-01)
// ═══════════════════════════════════════════════════════════════════════════
// Elles ne modifient pas le statut des transactions. Import/Export : on les
// instruit depuis la page de la transaction. Réservation et logistique : le
// dossier (pièces, échanges, transitions) s'ouvre ici même.

const MOTIFS = {
  non_recu: "Non reçue", endommage: "Endommagée", non_conforme: "Non conforme", quantite_incorrecte: "Quantité incorrecte",
  documents_manquants: "Documents manquants", retard_important: "Retard important", paiement_conteste: "Paiement contesté", autre: "Autre",
};
const ETATS = { opened: "Ouverte", evidence_requested: "Pièces demandées", under_review: "En examen", resolved: "Décision rendue", rejected: "Rejetée", closed: "Close" };

export function ReclamationsIESection({ headers }) {
  const [litiges, setLitiges] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/litiges", { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Chargement impossible.");
      setLitiges(d.litiges || []);
    } catch (e) { setErreur(e.message); }
  }, [headers]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 4px" }}><Scale size={16} aria-hidden="true" /> Réclamations en cours</h3>
      <p style={{ margin: "0 0 10px", fontSize: ".83rem", color: "#64748b" }}>
        Import/Export, réservations et logistique. Une réclamation ne change pas le statut de la transaction et ne bloque aucun fonds.
      </p>
      {erreur && <p style={{ color: "#b91c1c", fontSize: ".85rem" }}>{erreur}</p>}
      {litiges && !litiges.length && <p style={{ fontSize: ".85rem", color: "#64748b" }}>Aucune réclamation en cours.</p>}
      {litiges?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "6px 8px" }}>Référence</th><th style={{ padding: "6px 8px" }}>Transaction</th><th style={{ padding: "6px 8px" }}>Motif</th>
                <th style={{ padding: "6px 8px" }}>État</th><th style={{ padding: "6px 8px" }}>Ouverte le</th>
                <th style={{ padding: "6px 8px" }}>Échéance</th><th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {litiges.map((l) => {
                const ie = l.transaction?.type === "ie";
                const deplie = ouvert === l._id;
                return [
                  <tr key={l._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>{l.reference}</td>
                    <td style={{ padding: "8px" }}>{l.cible?.libelle || l.transaction?.type}{l.cible?.reference ? ` · ${l.cible.reference}` : ""}</td>
                    <td style={{ padding: "8px" }}>{MOTIFS[l.motif] || l.motif}</td>
                    <td style={{ padding: "8px" }}>{ETATS[l.etat] || l.etat}</td>
                    <td style={{ padding: "8px" }}>{fmtDate(l.ouvertLe)}</td>
                    <td style={{ padding: "8px" }}>{l.echeanceReponse ? fmtDate(l.echeanceReponse) : "non définie"}</td>
                    <td style={{ padding: "8px" }}>
                      {ie
                        ? <Link to={`/import-export/transaction/${l.transaction?.id}`}>Instruire →</Link>
                        : <button type="button" onClick={() => setOuvert(deplie ? null : l._id)} style={{ minHeight: 44, background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>{deplie ? "Fermer" : "Instruire"}</button>}
                    </td>
                  </tr>,
                  deplie && (
                    <tr key={`${l._id}-dossier`}>
                      <td colSpan={7} style={{ padding: "0 8px 12px" }}>
                        <LitigesTransaction txId={l.transaction.id} type={l.transaction.type} role="admin" ouvrable={false} />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
