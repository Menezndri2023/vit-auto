import styles from "../../AdminPanel.module.css";
import { timeAgo } from "../shared.jsx";
import { MessageCircle, Handshake, Headphones } from "lucide-react";

// Onglet « Support Client » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function SupportSection({
  loadSupportChats, openSupportChat, sendSupportReply, setSupportReply, supportActive, supportChats,
  supportLoading, supportMessages, supportMsgLoading, supportReply, supportSending,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><Headphones size={16} aria-hidden="true" /> Support Client</h2>
          <p className={styles.uiSousTitre}>Conversations client_support / partner_support — file partagée entre tous les admins actifs.</p>
        </div>
        <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
          onClick={loadSupportChats}>↻ Actualiser</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, minHeight: 480, alignItems: "stretch" }}>
        {/* ── Liste des conversations ── */}
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e2e8f0", fontSize: ".78rem", fontWeight: 700, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
            <span>{supportChats.length} conversation{supportChats.length > 1 ? "s" : ""}</span>
            {supportChats.some((c) => c.needsReply) && (
              <span style={{ color: "#dc2626" }}>{supportChats.filter((c) => c.needsReply).length} en attente</span>
            )}
          </div>
          <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
            {supportLoading && supportChats.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
            ) : supportChats.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}><MessageCircle size={16} aria-hidden="true" /></div>
                <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Aucune conversation support.</p>
              </div>
            ) : supportChats.map((c) => {
              const isActive = supportActive?._id === c._id;
              const name = c.requester ? `${c.requester.firstName} ${c.requester.lastName}` : "Utilisateur";
              return (
                <div key={c._id} onClick={() => openSupportChat(c)}
                  style={{
                    padding: "11px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
                    background: isActive ? "#eff6ff" : c.needsReply ? "#fffbeb" : "#fff",
                    borderBottom: "1px solid #f1f5f9",
                  }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: c.type === "partner_support" ? "#fff7ed" : "#f0f6ff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".85rem",
                    color: c.type === "partner_support" ? "#d97706" : "#3b82f6",
                  }}>
                    {(c.requester?.firstName?.[0] || "?").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <strong style={{ fontSize: ".85rem", color: "#0f1b3f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</strong>
                      <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ fontSize: ".76rem", color: c.needsReply ? "#92400e" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: c.needsReply ? 700 : 400 }}>
                      {c.type === "partner_support" && <Handshake size={13} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />}{c.lastMessage || "Conversation ouverte"}
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: ".68rem", fontWeight: 800, padding: "2px 6px", flexShrink: 0 }}>{c.unread}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Fil de conversation ── */}
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
          {!supportActive ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "2.4rem" }}><Headphones size={16} aria-hidden="true" /></div>
              <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Sélectionnez une conversation pour répondre.</p>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #e2e8f0", fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>
                {supportActive.requester ? `${supportActive.requester.firstName} ${supportActive.requester.lastName}` : "Utilisateur"}
                <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 600, color: "#94a3b8" }}>
                  {supportActive.type === "partner_support" ? "Support Partenaires" : "Service Client"} · {supportActive.requester?.email}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                {supportMsgLoading ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                ) : supportMessages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Aucun message pour l'instant.</div>
                ) : supportMessages.map((m) => {
                  const isAdminMsg = m.senderRole === "admin";
                  return (
                    <div key={m._id} style={{ alignSelf: isAdminMsg ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                      <div style={{
                        padding: "8px 12px", borderRadius: 12,
                        background: isAdminMsg ? "#0f1b3f" : "#f1f5f9",
                        color: isAdminMsg ? "#fff" : "#0f1b3f",
                        fontSize: ".85rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 3, textAlign: isAdminMsg ? "right" : "left" }}>
                        {timeAgo(m.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: 12, borderTop: "1.5px solid #e2e8f0", display: "flex", gap: 8 }}>
                <textarea
                  value={supportReply}
                  onChange={(e) => setSupportReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSupportReply(); } }}
                  placeholder="Votre réponse…"
                  rows={1}
                  style={{ flex: 1, resize: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px", fontSize: ".85rem", fontFamily: "inherit" }}
                />
                <button onClick={sendSupportReply} disabled={supportSending || !supportReply.trim()}
                  style={{ background: "#0f1b3f", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, cursor: "pointer", fontSize: ".85rem" }}>
                  {supportSending ? "…" : "Envoyer"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
