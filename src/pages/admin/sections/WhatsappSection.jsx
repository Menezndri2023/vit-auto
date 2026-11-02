import { Badge, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Bot WhatsApp partenaires » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function WhatsappSection({
  loadWaConversations, openWaConversation, sendWaReply, setWaFilter, setWaReply, waActive,
  waConversations, waFilter, waLoading, waReply, waSetStatus,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>💬 Bot WhatsApp partenaires</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Claude répond automatiquement aux prospects/partenaires sur WhatsApp. Conversations transférées à un humain ci-dessous.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select value={waFilter} onChange={(e) => setWaFilter(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
            <option value="escalated">À reprendre</option>
            <option value="bot">Gérées par le bot</option>
            <option value="closed">Clôturées</option>
            <option value="">Toutes</option>
          </select>
          <button className={styles.btnRefresh} onClick={loadWaConversations}>↻ Actualiser</button>
        </div>
      </div>

      {waLoading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: waActive ? "320px 1fr" : "1fr", gap: 20, alignItems: "start" }}>
          {/* Liste des conversations */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {waConversations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>💬</div>
                <p style={{ fontWeight: 600 }}>Aucune conversation pour ce filtre.</p>
              </div>
            ) : waConversations.map((c) => (
              <div key={c._id} onClick={() => openWaConversation(c)}
                style={{
                  cursor: "pointer", padding: "12px 14px", borderRadius: 10,
                  border: `1.5px solid ${waActive?._id === c._id ? "#0f1b3f" : "#e2e8f0"}`,
                  background: waActive?._id === c._id ? "#f8fafc" : "#fff",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: ".88rem", color: "#0f1b3f" }}>{c.contactName || c.phone}</strong>
                  <Badge
                    label={{ bot: "🤖 Bot", escalated: "🚩 À reprendre", closed: "Clôturée" }[c.status]}
                    color={c.status === "escalated" ? "#dc2626" : c.status === "bot" ? "#059669" : "#94a3b8"}
                    bg={c.status === "escalated" ? "#fee2e2" : c.status === "bot" ? "#ecfdf5" : "#f1f5f9"}
                  />
                </div>
                <p style={{ margin: "4px 0 0", fontSize: ".78rem", color: "#64748b" }}>{c.phone}</p>
                {c.escalationReason && <p style={{ margin: "2px 0 0", fontSize: ".75rem", color: "#dc2626" }}>{c.escalationReason}</p>}
                <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>{fmtDate(c.lastMessageAt)}</p>
              </div>
            ))}
          </div>

          {/* Thread + réponse */}
          {waActive && (
            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ color: "#0f1b3f" }}>{waActive.contactName || waActive.phone}</strong>
                  <span style={{ marginLeft: 8, fontSize: ".78rem", color: "#64748b" }}>{waActive.phone}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {waActive.status !== "bot" && (
                    <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "bot")}>Rendre au bot</button>
                  )}
                  {waActive.status !== "closed" && (
                    <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "closed")}>Clôturer</button>
                  )}
                </div>
              </div>

              <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                {waActive.messages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                    maxWidth: "75%", padding: "8px 12px", borderRadius: 10, fontSize: ".85rem",
                    background: m.role === "user" ? "#f1f5f9" : m.role === "admin" ? "#0f1b3f" : "#eff6ff",
                    color: m.role === "admin" ? "#fff" : "#0f172a",
                  }}>
                    {m.role !== "user" && (
                      <div style={{ fontSize: ".68rem", fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>
                        {m.role === "admin" ? "Vous (admin)" : "🤖 Bot"}
                      </div>
                    )}
                    {m.content}
                  </div>
                ))}
              </div>

              {waActive.status !== "closed" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={waReply} onChange={(e) => setWaReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendWaReply()}
                    placeholder="Répondre au partenaire..."
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
                  <button className={styles.btnApprove} onClick={sendWaReply} disabled={!waReply.trim()}>Envoyer</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
