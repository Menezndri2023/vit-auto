import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate } from "../shared.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// Réclamations Import/Export en cours (2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Elles ne modifient pas le statut des transactions : on les instruit depuis
// la page de la transaction (bloc « Réclamations »), où se trouvent pièces,
// échanges et transitions.

const MOTIFS = {
  non_recu: "Non reçue", endommage: "Endommagée", non_conforme: "Non conforme", quantite_incorrecte: "Quantité incorrecte",
  documents_manquants: "Documents manquants", retard_important: "Retard important", paiement_conteste: "Paiement contesté", autre: "Autre",
};
const ETATS = { opened: "Ouverte", evidence_requested: "Pièces demandées", under_review: "En examen", resolved: "Décision rendue", rejected: "Rejetée", closed: "Close" };

export function ReclamationsIESection({ headers }) {
  const [litiges, setLitiges] = useState(null);
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/import-export/litiges", { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Chargement impossible.");
      setLitiges(d.litiges || []);
    } catch (e) { setErreur(e.message); }
  }, [headers]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 4px" }}>🌍 Réclamations Import/Export en cours</h3>
      <p style={{ margin: "0 0 10px", fontSize: ".83rem", color: "#64748b" }}>
        Instruites depuis la page de chaque transaction. Elles ne changent pas le statut de la transaction et ne bloquent aucun fonds.
      </p>
      {erreur && <p style={{ color: "#b91c1c", fontSize: ".85rem" }}>{erreur}</p>}
      {litiges && !litiges.length && <p style={{ fontSize: ".85rem", color: "#64748b" }}>Aucune réclamation en cours.</p>}
      {litiges?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "6px 8px" }}>Référence</th><th style={{ padding: "6px 8px" }}>Motif</th>
                <th style={{ padding: "6px 8px" }}>État</th><th style={{ padding: "6px 8px" }}>Ouverte le</th>
                <th style={{ padding: "6px 8px" }}>Échéance</th><th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {litiges.map((l) => (
                <tr key={l._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}>{l.reference}</td>
                  <td style={{ padding: "8px" }}>{MOTIFS[l.motif] || l.motif}</td>
                  <td style={{ padding: "8px" }}>{ETATS[l.etat] || l.etat}</td>
                  <td style={{ padding: "8px" }}>{fmtDate(l.ouvertLe)}</td>
                  <td style={{ padding: "8px" }}>{l.echeanceReponse ? fmtDate(l.echeanceReponse) : "non définie"}</td>
                  <td style={{ padding: "8px" }}><Link to={`/import-export/transaction/${l.transaction?.id}`}>Instruire →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
