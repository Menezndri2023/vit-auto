import { Badge, StatCard, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";
import { AlertTriangle, Mail, Ban, CheckCircle2, Upload } from "lucide-react";

// Onglet « Emails & Livraison » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function EmailsSection({
  emailDeliveryLoading, emailFailures, emailStats, loadEmailDelivery,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><Mail size={16} aria-hidden="true" /> Emails & Livraison</h2>
          <p className={styles.uiSousTitre}>
            Suivi réel des envois (Resend) — LOI, Accords, factures, confirmations... Un email "envoyé" n'est confirmé "livré" que via le webhook Resend
            (ou l'ouverture du message) ; "Rejeté/Signalé spam" signifie que le serveur destinataire a explicitement refusé l'email.
          </p>
        </div>
        <button className={styles.btnRefresh} onClick={loadEmailDelivery}>↻ Actualiser</button>
      </div>

      {emailDeliveryLoading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (
        <>
          <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: ".82rem", color: "#92400e" }}>
            <AlertTriangle size={16} aria-hidden="true" /> Si "Rejetés/Signalés spam" reste élevé : vérifiez dans le dashboard Resend (Domains) que <code>vit-auto.com</code> est bien "Verified"
            (SPF/DKIM/DMARC) — un domaine non vérifié fait rejeter une grande partie des emails par Gmail/Outlook. Le webhook Resend doit aussi être
            configuré (Webhooks → email.delivered/bounced/complained/delivery_delayed → <code>RESEND_WEBHOOK_SECRET</code> côté serveur) pour que ce
            tableau reflète la réalité plutôt que de rester bloqué sur "Envoyé".
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard icon={<Upload size={20} aria-hidden="true" />} label="Envoyés (email)" value={emailStats?.email?.totalSent || 0} color="#6366f1" />
            <StatCard icon={<CheckCircle2 size={20} aria-hidden="true" />} label="Livrés/Ouverts" value={emailStats?.email?.totalOpened || 0} sub={`${emailStats?.email?.openRate || 0}% de taux d'ouverture`} color="#10b981" />
            <StatCard icon={<Ban size={20} aria-hidden="true" />} label="Rejetés / Signalés spam" value={(emailStats?.byStatus?.bounced || 0) + (emailStats?.byStatus?.complained || 0)} color="#ef4444" />
            <StatCard icon={<AlertTriangle size={20} aria-hidden="true" />} label="Échecs immédiats" value={emailStats?.byStatus?.failed || 0} color="#f59e0b" />
          </div>

          <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 10px" }}>Envois en échec récents</h3>
          {emailFailures.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
              <p style={{ margin: 0 }}>Aucun échec/bounce enregistré récemment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Destinataire</th>
                    <th>Type de document</th>
                    <th>Statut</th>
                    <th>Raison</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {emailFailures.map((f) => {
                    const stCfg = {
                      bounced:    { label: "Rejeté",        color: "#ef4444", bg: "#fef2f2" },
                      complained: { label: "Signalé spam",  color: "#dc2626", bg: "#fef2f2" },
                      failed:     { label: "Échec immédiat", color: "#f59e0b", bg: "#fffbeb" },
                    }[f.status] || { label: f.status, color: "#94a3b8", bg: "#f8fafc" };
                    return (
                      <tr key={f._id} className={styles.tr}>
                        <td style={{ fontSize: ".82rem" }}>
                          {f.to}
                          {f.userId && <span className={styles.vehMeta}>{f.userId.firstName} {f.userId.lastName}</span>}
                        </td>
                        <td style={{ fontSize: ".82rem" }}>{f.template || f.subject || "—"}</td>
                        <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                        <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 320 }}>{f.errorMessage || "—"}</td>
                        <td className={styles.tdDate}>{fmtDate(f.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
