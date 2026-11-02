import { Badge } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Notifications & Broadcast » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function NotificationsSection({
  broadcastForm, broadcastSending, sendBroadcast, setBroadcastForm,
}) {
  return (
    <div className={styles.tabContent}>
      <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 1.5rem" }}>🔔 Centre de notifications</h2>

      {/* Broadcast */}
      <div className={styles.chartCard} style={{ marginBottom:"1.5rem" }}>
        <h3 className={styles.chartTitle}>📢 Envoyer une notification groupée</h3>
        <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:520 }}>
          <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
            placeholder="Titre *" value={broadcastForm.titre}
            onChange={e => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
          <textarea style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", resize:"vertical", fontFamily:"inherit" }}
            rows={3} placeholder="Message *" value={broadcastForm.message}
            onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
          <select style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem" }}
            value={broadcastForm.targetRole} onChange={e => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
            <option value="all">Tous les utilisateurs</option>
            <option value="client">Clients uniquement</option>
            <option value="partenaire">Partenaires uniquement</option>
            <option value="chauffeur">Chauffeurs uniquement</option>
            <option value="importateur">Importateurs</option>
          </select>
          <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
            placeholder="Lien interne (ex: /catalogue) — optionnel" value={broadcastForm.lien}
            onChange={e => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
          <button className={styles.btnPrimary} style={{ width:"fit-content" }}
            disabled={broadcastSending} onClick={sendBroadcast}>
            {broadcastSending ? "Envoi en cours…" : "📤 Envoyer la notification"}
          </button>
        </div>
      </div>

      {/* Canaux disponibles */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>📡 Canaux de communication</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
          {[
            { icon:"🔔", label:"Notifications in-app",  status:"Actif",       color:"#10b981" },
            { icon:"📧", label:"Email (Nodemailer)",    status:"À configurer", color:"#f59e0b" },
            { icon:"📱", label:"SMS",                   status:"Bientôt",     color:"#94a3b8" },
            { icon:"💬", label:"WhatsApp Business",     status:"Bientôt",     color:"#94a3b8" },
            { icon:"🌐", label:"Push Web (PWA)",        status:"Bientôt",     color:"#94a3b8" },
          ].map(c => (
            <div key={c.label} style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0" }}>
              <div style={{ fontSize:"1.5rem", marginBottom:8 }}>{c.icon}</div>
              <div style={{ fontWeight:700, fontSize:"0.88rem", color:"#0f1b3f", marginBottom:4 }}>{c.label}</div>
              <Badge label={c.status} color={c.color} bg={c.color+"18"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
