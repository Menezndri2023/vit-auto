import styles from "../../AdminPanel.module.css";

// Onglet « Demandes d'assistance » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function AssistanceSection({
  changerStatutTicket, loadTickets, repondreTicket, setTicketOuvert, setTicketReponse, setTicketsStatut,
  ticketOuvert, ticketReponse, tickets, ticketsEnRetard, ticketsStatut,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🎫 Demandes d'assistance</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
            File ordonnée par échéance de première réponse.
            {ticketsEnRetard > 0 && <strong style={{ color: "#dc2626" }}> {ticketsEnRetard} demande{ticketsEnRetard > 1 ? "s" : ""} hors délai.</strong>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ticketsStatut} onChange={(e) => setTicketsStatut(e.target.value)}
            aria-label="Statut des demandes"
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".8rem", minHeight: 36 }}>
            <option value="">En cours</option>
            <option value="open">Ouvertes</option>
            <option value="in_progress">En traitement</option>
            <option value="waiting_user">En attente de l'utilisateur</option>
            <option value="resolved">Résolues</option>
            <option value="closed">Clôturées</option>
          </select>
          <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
            onClick={loadTickets}>↻ Actualiser</button>
        </div>
      </div>

      {tickets.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: ".9rem" }}>Aucune demande en cours.</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem", background: "#fff" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Objet", "Demandeur", "Formule", "Priorité", "Échéance", "État", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t._id} style={{ borderTop: "1px solid #f1f5f9", background: t.enRetard ? "#fef2f2" : undefined }}>
                  <td style={{ padding: "10px 12px" }}>{t.subject}</td>
                  <td style={{ padding: "10px 12px" }}>{[t.userId?.firstName, t.userId?.lastName].filter(Boolean).join(" ") || t.userId?.email || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{t.plan}</td>
                  <td style={{ padding: "10px 12px" }}>{t.priority}</td>
                  <td style={{ padding: "10px 12px", color: t.enRetard ? "#dc2626" : "#475569", fontWeight: t.enRetard ? 700 : 400 }}>
                    {t.slaDueAt ? new Date(t.slaDueAt).toLocaleString("fr-FR") : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{t.status}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: ".78rem" }}
                      onClick={() => { setTicketOuvert(ticketOuvert?._id === t._id ? null : t); setTicketReponse(""); }}>
                      {ticketOuvert?._id === t._id ? "Fermer" : "Ouvrir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ticketOuvert && (
        <div style={{ marginTop: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "#0f1b3f" }}>{ticketOuvert.subject}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {(ticketOuvert.messages || []).map((m, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 10, maxWidth: "80%", alignSelf: m.isAdmin ? "flex-end" : "flex-start", background: m.isAdmin ? "#eff6ff" : "#f1f5f9" }}>
                <strong style={{ fontSize: ".75rem", color: "#64748b" }}>{m.isAdmin ? "Support" : "Partenaire"}</strong>
                <p style={{ margin: "4px 0 0", lineHeight: 1.55 }}>{m.content}</p>
              </div>
            ))}
          </div>
          <textarea rows={4} value={ticketReponse} onChange={(e) => setTicketReponse(e.target.value)} placeholder="Votre réponse…"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
              onClick={() => repondreTicket(ticketOuvert._id, ticketReponse)}>Répondre</button>
            <button style={{ background: "#fff", color: "#16a34a", border: "1.5px solid #bbf7d0", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
              onClick={() => changerStatutTicket(ticketOuvert._id, "resolved")}>Marquer résolue</button>
            <button style={{ background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
              onClick={() => changerStatutTicket(ticketOuvert._id, "closed")}>Clôturer</button>
          </div>
        </div>
      )}
    </div>
  );
}
