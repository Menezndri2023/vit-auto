import styles from "../../AdminPanel.module.css";
import { timeAgo } from "../shared.jsx";
import { Eye } from "lucide-react";

// Onglet « Chats Client↔Partenaire » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function SupervisionChatsSection({
  cpActive, cpChats, cpChatsLoading, cpMessages, cpMsgLoading, loadClientPartnerChats,
  openClientPartnerChat,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><Eye size={16} aria-hidden="true" /> Chats Client↔Partenaire</h2>
          <p className={styles.uiSousTitre}>Supervision en lecture seule — aucun échange n'a lieu hors de la plateforme.</p>
        </div>
        <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
          onClick={loadClientPartnerChats}>↻ Actualiser</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, minHeight: 480, alignItems: "stretch" }}>
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e2e8f0", fontSize: ".78rem", fontWeight: 700, color: "#64748b" }}>
            {cpChats.length} conversation{cpChats.length > 1 ? "s" : ""}
          </div>
          <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
            {cpChatsLoading && cpChats.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
            ) : cpChats.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}><Eye size={16} aria-hidden="true" /></div>
                <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Aucune conversation client↔partenaire.</p>
              </div>
            ) : cpChats.map((c) => {
              const isActive = cpActive?._id === c._id;
              return (
                <div key={c._id} onClick={() => openClientPartnerChat(c)}
                  style={{ padding: "11px 14px", cursor: "pointer", background: isActive ? "#eff6ff" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <strong style={{ fontSize: ".85rem", color: "#0f1b3f" }}>
                      {c.client?.firstName} {c.client?.lastName} ↔ {c.partner?.firstName} {c.partner?.lastName}
                    </strong>
                    <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <div style={{ fontSize: ".76rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.booking?.reference ? `${c.booking.reference} · ` : ""}{c.lastMessage || "Conversation ouverte"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
          {!cpActive ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "2.4rem" }}><Eye size={16} aria-hidden="true" /></div>
              <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Sélectionnez une conversation à superviser.</p>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #e2e8f0", fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>
                {cpActive.client?.firstName} {cpActive.client?.lastName} ↔ {cpActive.partner?.firstName} {cpActive.partner?.lastName}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                {cpMsgLoading ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                ) : cpMessages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Aucun message pour l'instant.</div>
                ) : cpMessages.map((m) => {
                  const isPartnerMsg = m.senderRole !== "client";
                  return (
                    <div key={m._id} style={{ alignSelf: isPartnerMsg ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                      <div style={{
                        padding: "8px 12px", borderRadius: 12,
                        background: isPartnerMsg ? "#0f1b3f" : "#f1f5f9",
                        color: isPartnerMsg ? "#fff" : "#0f1b3f",
                        fontSize: ".85rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 3, textAlign: isPartnerMsg ? "right" : "left" }}>
                        {m.sender?.firstName} · {timeAgo(m.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
