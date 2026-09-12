// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import styles from "../../AdminPanel.module.css";

// ── Publicités & Campagnes — le backend (server/models/Ad.js, controllers/
// adsController.js, routes/ads.js) existait déjà en entier (CRUD + tracking
// clics) mais n'était consommé par aucune interface, ni admin ni publique.
const AD_POSITION_LABELS = {
  featured_section: "Section vedette (accueil)",
  catalogue_top:    "Haut du catalogue",
  catalogue_mid:    "Milieu du catalogue",
  sidebar:          "Barre latérale",
};

const emptyAdForm = () => ({ title: "", description: "", image: "", link: "", linkLabel: "En savoir plus", position: "featured_section", active: true, priority: 0 });

export function AdsSection({ ads, loading, form, setForm, saving, onSave, onToggle, onDelete }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className={styles.btnRefresh} style={{ background: "#0f1b3f", color: "#fff", border: "none" }}
          onClick={() => setForm(emptyAdForm())}>
          + Nouvelle annonce
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : ads.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📢</div>
          <p style={{ fontWeight: 600 }}>Aucune bannière/campagne pour le moment.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 14 }}>
          {ads.map((ad) => (
            <div key={ad._id} style={{ border: `2px solid ${ad.active ? "#10b981" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              {ad.image
                ? <img src={ad.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 100, objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                : <div style={{ height: 100, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>📢</div>}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0f1b3f" }}>{ad.title}</div>
                <div style={{ fontSize: ".74rem", color: "#94a3b8", marginBottom: 6 }}>{AD_POSITION_LABELS[ad.position] || ad.position}</div>
                <div style={{ fontSize: ".76rem", color: "#64748b", marginBottom: 8 }}>👁️ {ad.views || 0} vues · 🖱️ {ad.clicks || 0} clics</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setForm(ad)} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".76rem" }}>✏️ Éditer</button>
                  <button onClick={() => onToggle(ad)} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".76rem", background: ad.active ? "#fef3c7" : "#d1fae5", color: ad.active ? "#b45309" : "#047857" }}>
                    {ad.active ? "⏸️ Pause" : "▶️ Activer"}
                  </button>
                  <button onClick={() => onDelete(ad._id)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontWeight: 700, fontSize: ".76rem" }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className={styles.modalBackdrop} onClick={() => setForm(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>{form._id ? "✏️ Modifier l'annonce" : "+ Nouvelle annonce"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0" }}>
              <input placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <textarea placeholder="Description (optionnel)" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", minHeight: 60, fontFamily: "inherit" }} />
              <input placeholder="URL de l'image" value={form.image || ""} onChange={(e) => setForm({ ...form, image: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <input placeholder="Lien de redirection au clic" value={form.link || ""} onChange={(e) => setForm({ ...form, link: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <input placeholder="Texte du bouton" value={form.linkLabel || ""} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
                {Object.entries(AD_POSITION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem" }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active immédiatement
              </label>
            </div>
            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={onSave} disabled={saving}>{saving ? "Envoi…" : "Enregistrer"}</button>
              <button className={styles.btnSecondary} onClick={() => setForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
