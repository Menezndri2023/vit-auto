import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./PartnerPMSDashboard.module.css";

const API = (path, token, opts = {}) =>
  fetch(`/api/pms${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });

const fmtNum = (n) => Number(n || 0).toLocaleString("fr-FR");
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMoney = (n, c = "USD") => `${fmtNum(n)} ${c}`;

// ── Statut badges ─────────────────────────────────────────────────────────────
const LEAD_STATUS = {
  nouveau:       { label: "Nouveau",        color: "#3b82f6", bg: "#eff6ff" },
  contacte:      { label: "Contacté",       color: "#8b5cf6", bg: "#f5f3ff" },
  en_discussion: { label: "En discussion",  color: "#f59e0b", bg: "#fffbeb" },
  devis_envoye:  { label: "Devis envoyé",   color: "#0891b2", bg: "#ecfeff" },
  negociation:   { label: "Négociation",    color: "#d97706", bg: "#fef3c7" },
  gagne:         { label: "Gagné ✓",        color: "#059669", bg: "#ecfdf5" },
  perdu:         { label: "Perdu",          color: "#dc2626", bg: "#fef2f2" },
  archive:       { label: "Archivé",        color: "#94a3b8", bg: "#f8fafc" },
};

const QUOTE_STATUS = {
  brouillon: { label: "Brouillon",    color: "#64748b", bg: "#f8fafc" },
  envoye:    { label: "Envoyé",       color: "#3b82f6", bg: "#eff6ff" },
  vu:        { label: "Vu",           color: "#8b5cf6", bg: "#f5f3ff" },
  accepte:   { label: "Accepté ✓",   color: "#059669", bg: "#ecfdf5" },
  refuse:    { label: "Refusé",       color: "#dc2626", bg: "#fef2f2" },
  expire:    { label: "Expiré",       color: "#f59e0b", bg: "#fffbeb" },
  commande:  { label: "Commandé",     color: "#0891b2", bg: "#ecfeff" },
};

const URGENCY = {
  faible: { label: "Faible",  color: "#94a3b8" },
  moyen:  { label: "Moyen",   color: "#f59e0b" },
  eleve:  { label: "Élevé",   color: "#f97316" },
  urgent: { label: "Urgent!", color: "#dc2626" },
};

// ── Badge pill ───────────────────────────────────────────────────────────────
const StatusBadge = ({ cfg, val }) => {
  const c = cfg[val] || { label: val, color: "#94a3b8", bg: "#f8fafc" };
  return (
    <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:999,
      fontSize:".72rem", fontWeight:700, background:c.bg, color:c.color }}>
      {c.label}
    </span>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: VUE ACCUEIL (Dashboard home)
// ══════════════════════════════════════════════════════════════════════════════
function HomeSection({ token, user, onNav }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    API("/overview", token).then((r) => r.ok ? r.json() : null).then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const kpiCards = data ? [
    { icon:"🎯", label:"Leads totaux",    value:data.leadsStats?.total || 0,  sub:`${data.leadsStats?.nouveau || 0} nouveaux`, color:"#3b82f6" },
    { icon:"✅", label:"Leads gagnés",    value:data.leadsStats?.gagne || 0,  sub:`Taux ${data.leadsStats?.conversionRate || 0}%`, color:"#059669" },
    { icon:"📄", label:"Devis envoyés",   value:data.quotesStats?.envoye || 0,sub:`${data.quotesStats?.accepte || 0} acceptés`, color:"#8b5cf6" },
    { icon:"🚗", label:"Véhicules",       value:data.vehicles?.total || 0,    sub:`${data.vehicles?.available || 0} disponibles`, color:"#f59e0b" },
  ] : [];

  if (loading) return <div className={styles.loader}>Chargement…</div>;
  if (error) return <div className={styles.emptyHint}>Impossible de charger le tableau de bord. Vérifiez votre connexion et réessayez.</div>;

  return (
    <div className={styles.section}>
      {/* ── Bienvenue ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <h2 className={styles.welcomeTitle}>Bienvenue, {user?.firstName} 👋</h2>
          <p className={styles.welcomeSub}>
            {data?.showroom?.isPublished
              ? `Votre showroom est en ligne · ${fmtNum(data.showroom.viewCount)} vues`
              : "Votre showroom n'est pas encore publié"}
          </p>
        </div>
        <div className={styles.welcomeActions}>
          <button className={styles.btnPrimary} onClick={() => onNav("leads")}>+ Nouveau lead</button>
          <button className={styles.btnSecondary} onClick={() => onNav("quotes")}>+ Nouveau devis</button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpiGrid}>
        {kpiCards.map((k) => (
          <div key={k.label} className={styles.kpiCard} style={{ borderTopColor: k.color }}>
            <div className={styles.kpiIcon} style={{ background: k.color + "18", color: k.color }}>{k.icon}</div>
            <div className={styles.kpiValue}>{fmtNum(k.value)}</div>
            <div className={styles.kpiLabel}>{k.label}</div>
            <div className={styles.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Pipeline rapide ── */}
      {data && (
        <div className={styles.pipelineRow}>
          <div className={styles.pipelineCard}>
            <h3 className={styles.pipelineTitle}>Pipeline Leads</h3>
            {Object.entries(LEAD_STATUS).slice(0, 6).map(([k, v]) => (
              <div key={k} className={styles.pipelineItem}>
                <span className={styles.pipelineDot} style={{ background: v.color }} />
                <span className={styles.pipelineName}>{v.label}</span>
                <span className={styles.pipelineCount} style={{ color: v.color }}>
                  {data.leadsStats?.[k] || 0}
                </span>
              </div>
            ))}
            <button className={styles.pipelineLink} onClick={() => onNav("leads")}>Voir tous les leads →</button>
          </div>

          <div className={styles.pipelineCard}>
            <h3 className={styles.pipelineTitle}>Leads par pays</h3>
            {Object.entries(data.leadsByCountry || {}).slice(0, 6).map(([country, count]) => (
              <div key={country} className={styles.pipelineItem}>
                <span className={styles.pipelineName}>🌍 {country}</span>
                <span className={styles.pipelineCount}>{count}</span>
              </div>
            ))}
            {Object.keys(data.leadsByCountry || {}).length === 0 && (
              <p className={styles.emptyHint}>Aucun lead encore</p>
            )}
          </div>

          <div className={styles.pipelineCard}>
            <h3 className={styles.pipelineTitle}>Activité 6 derniers mois</h3>
            <div className={styles.miniChart}>
              {(data.monthlyLeads || []).map((m) => {
                const max = Math.max(...(data.monthlyLeads || []).map((x) => x.count), 1);
                return (
                  <div key={m.month} className={styles.miniBar}>
                    <div className={styles.miniBarFill} style={{ height: `${(m.count / max) * 100}%` }} />
                    <span className={styles.miniBarLabel}>{m.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Liens rapides ── */}
      <div className={styles.quickLinks}>
        {[
          { icon:"🏢", label:"Mon Entreprise",    sub:"Profil & certification",         nav:"company"      },
          { icon:"🏪", label:"Mon Showroom",       sub:"Vitrine publique",               nav:"showroom"     },
          { icon:"🚗", label:"Ma Flotte",          sub:"Gérer mes véhicules",            nav:"fleet"        },
          { icon:"📊", label:"Analytics",          sub:"Statistiques complètes",         nav:"analytics"    },
          { icon:"⭐", label:"Score de confiance", sub:"Trust Center VIT AUTO",          nav:"performance"  },
          { icon:"📦", label:"Commandes",          to:"/vendor/dashboard"                                   },
        ].map((q) => (
          <div
            key={q.label}
            className={styles.quickCard}
            onClick={() => q.nav ? onNav(q.nav) : null}
          >
            {q.to ? (
              <Link to={q.to} className={styles.quickCardInner}>
                <span className={styles.quickIcon}>{q.icon}</span>
                <span className={styles.quickLabel}>{q.label}</span>
                {q.sub && <span className={styles.quickSub}>{q.sub}</span>}
              </Link>
            ) : (
              <div className={styles.quickCardInner}>
                <span className={styles.quickIcon}>{q.icon}</span>
                <span className={styles.quickLabel}>{q.label}</span>
                {q.sub && <span className={styles.quickSub}>{q.sub}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: LEADS
// ══════════════════════════════════════════════════════════════════════════════
function LeadsSection({ token, showToast }) {
  const [leads, setLeads]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ buyer: {}, vehicle: {}, budget: {}, status: "nouveau", urgency: "moyen", source: "website" });
  const [saving, setSaving]   = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const qs = filterStatus ? `?status=${filterStatus}` : "";
    API(`/leads${qs}`, token)
      .then((r) => r.ok ? r.json() : { leads: [], total: 0 })
      .then((d) => { setLeads(d.leads || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const setF = (path, val) => {
    setForm((prev) => {
      const keys = path.split(".");
      if (keys.length === 1) return { ...prev, [path]: val };
      return { ...prev, [keys[0]]: { ...prev[keys[0]], [keys[1]]: val } };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await API("/leads", token, { method: "POST", body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json()).message);
      setShowForm(false);
      setForm({ buyer: {}, vehicle: {}, budget: {}, status: "nouveau", urgency: "moyen", source: "website" });
      showToast("Lead créé avec succès", "success");
      load();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      const r = await API(`/leads/${id}`, token, { method: "PUT", body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error((await r.json()).message);
      if (selected?._id === id) setSelected((s) => ({ ...s, status }));
      setLeads((prev) => prev.map((l) => l._id === id ? { ...l, status } : l));
    } catch (e) { showToast(e.message || "Erreur lors de la mise à jour", "error"); }
  };

  const addFollowUp = async (id) => {
    if (!followUpNote.trim()) return;
    try {
      const r = await API(`/leads/${id}/followup`, token, { method: "POST", body: JSON.stringify({ note: followUpNote, method: "phone" }) });
      if (!r.ok) throw new Error((await r.json()).message);
      showToast("Suivi ajouté", "success");
      setFollowUpNote("");
      const r2 = await API(`/leads/${id}`, token);
      if (r2.ok) setSelected(await r2.json());
    } catch (e) { showToast(e.message || "Erreur", "error"); }
  };

  const deleteLead = async (id) => {
    if (!window.confirm("Supprimer ce lead ?")) return;
    try {
      const r = await API(`/leads/${id}`, token, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      setSelected(null);
      showToast("Lead supprimé", "success");
      load();
    } catch (e) { showToast(e.message || "Erreur", "error"); }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>🎯 Gestion des Leads</h2>
          <p className={styles.sectionSub}>{fmtNum(total)} prospect{total > 1 ? "s" : ""}</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>+ Nouveau lead</button>
      </div>

      {/* Filtres */}
      <div className={styles.filterRow}>
        {["", "nouveau", "contacte", "en_discussion", "devis_envoye", "gagne", "perdu"].map((s) => (
          <button
            key={s}
            className={`${styles.filterBtn} ${filterStatus === s ? styles.filterActive : ""}`}
            onClick={() => setFilterStatus(s)}
          >
            {s ? LEAD_STATUS[s]?.label || s : "Tous"}
          </button>
        ))}
      </div>

      {/* Layout leads */}
      <div className={styles.leadLayout}>
        {/* Liste */}
        <div className={styles.leadList}>
          {loading ? (
            <div className={styles.loader}>Chargement…</div>
          ) : leads.length === 0 ? (
            <div className={styles.emptyState}>
              <span>🎯</span>
              <p>Aucun lead</p>
              <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>Créer le premier lead</button>
            </div>
          ) : leads.map((l) => (
            <div
              key={l._id}
              className={`${styles.leadCard} ${selected?._id === l._id ? styles.leadCardActive : ""}`}
              onClick={() => setSelected(l)}
            >
              <div className={styles.leadCardTop}>
                <span className={styles.leadName}>{l.buyer?.name || l.buyer?.email || "Acheteur inconnu"}</span>
                <StatusBadge cfg={LEAD_STATUS} val={l.status} />
              </div>
              <div className={styles.leadCardMeta}>
                <span>🌍 {l.buyer?.country || "—"}</span>
                <span>🚗 {l.vehicle?.make} {l.vehicle?.model}</span>
                {l.urgency && <span style={{ color: URGENCY[l.urgency]?.color, fontWeight:700 }}>{URGENCY[l.urgency]?.label}</span>}
              </div>
              <div className={styles.leadCardDate}>{fmtDate(l.createdAt)}</div>
            </div>
          ))}
        </div>

        {/* Détail lead */}
        {selected ? (
          <div className={styles.leadDetail}>
            <div className={styles.leadDetailHeader}>
              <h3>{selected.buyer?.name || selected.buyer?.email}</h3>
              <div style={{ display:"flex", gap:8 }}>
                <button className={styles.btnDanger} onClick={() => deleteLead(selected._id)}>🗑</button>
                <button className={styles.btnSecondary} onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>

            {/* Statut rapide */}
            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Changer le statut</p>
              <div className={styles.statusRow}>
                {Object.entries(LEAD_STATUS).map(([k, v]) => (
                  <button
                    key={k}
                    style={{ background: selected.status === k ? v.color : v.bg, color: selected.status === k ? "#fff" : v.color,
                      border:`1px solid ${v.color}`, borderRadius:8, padding:"4px 10px", fontSize:".72rem", fontWeight:700, cursor:"pointer" }}
                    onClick={() => updateStatus(selected._id, k)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Infos acheteur */}
            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Acheteur</p>
              <table className={styles.infoTable}>
                {[
                  ["Nom",       selected.buyer?.name],
                  ["Email",     selected.buyer?.email],
                  ["Téléphone", selected.buyer?.phone],
                  ["WhatsApp",  selected.buyer?.whatsapp],
                  ["Pays",      selected.buyer?.country],
                  ["Société",   selected.buyer?.company],
                ].map(([k, v]) => v ? (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ) : null)}
              </table>
            </div>

            {/* Véhicule souhaité */}
            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Véhicule recherché</p>
              <table className={styles.infoTable}>
                {[
                  ["Marque",    selected.vehicle?.make],
                  ["Modèle",    selected.vehicle?.model],
                  ["Année",     selected.vehicle?.year],
                  ["Quantité",  selected.vehicle?.quantity],
                  ["Condition", selected.vehicle?.conditions],
                  ["Notes",     selected.vehicle?.notes],
                ].map(([k, v]) => v ? (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ) : null)}
              </table>
            </div>

            {/* Budget */}
            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Budget</p>
              <table className={styles.infoTable}>
                {[
                  ["Budget min", selected.budget?.min ? fmtMoney(selected.budget.min, selected.budget.currency) : null],
                  ["Budget max", selected.budget?.max ? fmtMoney(selected.budget.max, selected.budget.currency) : null],
                  ["Incoterm",   selected.budget?.incoterm],
                  ["Paiement",   selected.budget?.financing],
                  ["Destination",selected.destinationCountry],
                  ["Port",       selected.destinationPort],
                ].map(([k, v]) => v ? (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ) : null)}
              </table>
            </div>

            {/* Suivi */}
            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Historique de suivi ({selected.followUps?.length || 0})</p>
              {selected.followUps?.map((f, i) => (
                <div key={i} className={styles.followUpItem}>
                  <span className={styles.followUpDate}>{fmtDate(f.date)}</span>
                  <span className={styles.followUpNote}>{f.note}</span>
                </div>
              ))}
              <div className={styles.followUpInput}>
                <input
                  placeholder="Ajouter une note de suivi…"
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFollowUp(selected._id)}
                />
                <button onClick={() => addFollowUp(selected._id)}>+</button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.leadDetailEmpty}>
            <span>👆</span>
            <p>Sélectionnez un lead pour voir les détails</p>
          </div>
        )}
      </div>

      {/* Formulaire nouveau lead */}
      {showForm && (
        <div className={styles.overlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Nouveau Lead</h3>
              <button onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.fieldGroupLabel}>Acheteur</p>
              <div className={styles.formGrid2}>
                <label>Nom<input value={form.buyer.name || ""} onChange={(e) => setF("buyer.name", e.target.value)} placeholder="Jean Dupont" /></label>
                <label>Email<input type="email" value={form.buyer.email || ""} onChange={(e) => setF("buyer.email", e.target.value)} /></label>
                <label>Téléphone<input value={form.buyer.phone || ""} onChange={(e) => setF("buyer.phone", e.target.value)} /></label>
                <label>WhatsApp<input value={form.buyer.whatsapp || ""} onChange={(e) => setF("buyer.whatsapp", e.target.value)} /></label>
                <label>Pays<input value={form.buyer.country || ""} onChange={(e) => setF("buyer.country", e.target.value)} placeholder="Côte d'Ivoire" /></label>
                <label>Société<input value={form.buyer.company || ""} onChange={(e) => setF("buyer.company", e.target.value)} /></label>
              </div>

              <p className={styles.fieldGroupLabel}>Véhicule recherché</p>
              <div className={styles.formGrid3}>
                <label>Marque<input value={form.vehicle.make || ""} onChange={(e) => setF("vehicle.make", e.target.value)} placeholder="Toyota" /></label>
                <label>Modèle<input value={form.vehicle.model || ""} onChange={(e) => setF("vehicle.model", e.target.value)} placeholder="Land Cruiser" /></label>
                <label>Quantité<input type="number" min="1" value={form.vehicle.quantity || 1} onChange={(e) => setF("vehicle.quantity", e.target.value)} /></label>
              </div>

              <p className={styles.fieldGroupLabel}>Budget & Priorité</p>
              <div className={styles.formGrid3}>
                <label>Budget min ($)<input type="number" value={form.budget.min || ""} onChange={(e) => setF("budget.min", e.target.value)} /></label>
                <label>Budget max ($)<input type="number" value={form.budget.max || ""} onChange={(e) => setF("budget.max", e.target.value)} /></label>
                <label>
                  Urgence
                  <select value={form.urgency} onChange={(e) => setF("urgency", e.target.value)}>
                    {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.formGrid2}>
                <label>Pays destination<input value={form.destinationCountry || ""} onChange={(e) => setForm((p) => ({ ...p, destinationCountry: e.target.value }))} /></label>
                <label>
                  Source
                  <select value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}>
                    {["website","whatsapp","email","phone","referral","showroom","import_export","other"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
                <button className={styles.btnPrimary} onClick={save} disabled={saving}>
                  {saving ? "Enregistrement…" : "Créer le lead"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: DEVIS (Quotation Builder)
// ══════════════════════════════════════════════════════════════════════════════
function QuotesSection({ token, showToast }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    buyer: {},
    vehicles: [{ make:"", model:"", year: new Date().getFullYear(), quantity:1, unitPrice:0, currency:"USD" }],
    lines: [
      { description:"Véhicule(s)", qty:1, unitPrice:0, currency:"USD", category:"vehicule" },
      { description:"Transport maritime", qty:1, unitPrice:0, currency:"USD", category:"transport" },
      { description:"Assurance transport", qty:1, unitPrice:0, currency:"USD", category:"assurance" },
      { description:"Inspection pré-expédition", qty:1, unitPrice:0, currency:"USD", category:"inspection" },
      { description:"Frais portuaires", qty:1, unitPrice:0, currency:"USD", category:"port" },
    ],
    incoterm:"CIF", currency:"USD", discount:0, taxRate:0,
    paymentTerms:"30% acompte, 70% avant expédition",
    deliveryTime:"30-45 jours après paiement",
    validityDays:30,
    portOfLoading:"", portOfDischarge:"",
    notes:"",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    API("/quotes", token)
      .then((r) => r.ok ? r.json() : { quotes: [] })
      .then((d) => setQuotes(d.quotes || []))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const setF = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const setFNested = (key, subkey, val) => setForm((p) => ({ ...p, [key]: { ...p[key], [subkey]: val } }));

  const updateLine = (i, field, val) => {
    const newLines = [...form.lines];
    newLines[i] = { ...newLines[i], [field]: val };
    setF("lines", newLines);
  };

  const subtotal = form.lines.reduce((s, l) => s + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0);
  const discountAmt = Math.round(subtotal * ((form.discount || 0) / 100));
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = Math.round(afterDiscount * ((form.taxRate || 0) / 100));
  const total = afterDiscount + taxAmt;

  const save = async (asDraft = true) => {
    setSaving(true);
    try {
      const body = { ...form, status: asDraft ? "brouillon" : "envoye" };
      const r = await API("/quotes", token, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).message);
      showToast(asDraft ? "Devis enregistré" : "Devis envoyé", "success");
      setShowBuilder(false);
      load();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const sendQuote = async (id) => {
    try {
      const r = await API(`/quotes/${id}/send`, token, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).message);
      showToast("Devis marqué comme envoyé", "success");
      load();
    } catch (e) { showToast(e.message || "Erreur", "error"); }
  };

  const deleteQuote = async (id) => {
    if (!window.confirm("Supprimer ce devis ?")) return;
    try {
      const r = await API(`/quotes/${id}`, token, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      setSelected(null);
      showToast("Devis supprimé", "success");
      load();
    } catch (e) { showToast(e.message || "Erreur", "error"); }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>📄 Générateur de Devis</h2>
          <p className={styles.sectionSub}>{quotes.length} devis créés</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowBuilder(true)}>+ Nouveau devis</button>
      </div>

      {/* Liste devis */}
      {loading ? (
        <div className={styles.loader}>Chargement…</div>
      ) : quotes.length === 0 ? (
        <div className={styles.emptyState}>
          <span>📄</span>
          <p>Aucun devis créé</p>
          <button className={styles.btnPrimary} onClick={() => setShowBuilder(true)}>Créer mon premier devis</button>
        </div>
      ) : (
        <div className={styles.quoteGrid}>
          {quotes.map((q) => (
            <div key={q._id} className={styles.quoteCard} onClick={() => setSelected(selected?._id === q._id ? null : q)}>
              <div className={styles.quoteCardTop}>
                <span className={styles.quoteNumber}>{q.quoteNumber}</span>
                <StatusBadge cfg={QUOTE_STATUS} val={q.status} />
              </div>
              <div className={styles.quoteCardBuyer}>{q.buyer?.name || q.buyer?.email || "—"}</div>
              <div className={styles.quoteCardTotal}>{fmtMoney(q.total, q.currency)}</div>
              <div className={styles.quoteCardDate}>{fmtDate(q.createdAt)}</div>
              <div className={styles.quoteCardActions}>
                {q.status === "brouillon" && (
                  <button className={styles.btnSmPrimary} onClick={(e) => { e.stopPropagation(); sendQuote(q._id); }}>
                    📨 Envoyer
                  </button>
                )}
                <button className={styles.btnSmDanger} onClick={(e) => { e.stopPropagation(); deleteQuote(q._id); }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quotation Builder ── */}
      {showBuilder && (
        <div className={styles.overlay} onClick={() => setShowBuilder(false)}>
          <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>📄 Créer un devis professionnel</h3>
              <button onClick={() => setShowBuilder(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {/* Acheteur */}
              <p className={styles.fieldGroupLabel}>Informations acheteur</p>
              <div className={styles.formGrid3}>
                <label>Nom *<input value={form.buyer.name || ""} onChange={(e) => setFNested("buyer","name",e.target.value)} /></label>
                <label>Email<input type="email" value={form.buyer.email || ""} onChange={(e) => setFNested("buyer","email",e.target.value)} /></label>
                <label>Pays<input value={form.buyer.country || ""} onChange={(e) => setFNested("buyer","country",e.target.value)} /></label>
              </div>

              {/* Lignes devis */}
              <p className={styles.fieldGroupLabel}>Lignes du devis</p>
              <table className={styles.quoteTable}>
                <thead>
                  <tr><th>Description</th><th>Qté</th><th>Prix unitaire ({form.currency})</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td><input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} /></td>
                      <td><input type="number" min="0" value={l.qty} onChange={(e) => updateLine(i, "qty", e.target.value)} style={{ width:60 }} /></td>
                      <td><input type="number" min="0" value={l.unitPrice} onChange={(e) => updateLine(i, "unitPrice", e.target.value)} /></td>
                      <td className={styles.quoteLineTotal}>{fmtMoney((l.qty || 1) * (l.unitPrice || 0), form.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className={styles.btnSecondarySmall} onClick={() => setF("lines", [...form.lines, { description:"", qty:1, unitPrice:0, currency:form.currency, category:"autre" }])}>
                + Ajouter une ligne
              </button>

              {/* Totaux */}
              <div className={styles.quoteTotals}>
                <div className={styles.quoteTotalRow}>
                  <span>Sous-total</span>
                  <span>{fmtMoney(subtotal, form.currency)}</span>
                </div>
                <div className={styles.quoteTotalRow}>
                  <span>Remise (%) <input type="number" min="0" max="100" value={form.discount} onChange={(e) => setF("discount", Number(e.target.value) || 0)} style={{ width:50, marginLeft:8 }} /></span>
                  <span>- {fmtMoney(discountAmt, form.currency)}</span>
                </div>
                <div className={styles.quoteTotalRow}>
                  <span>TVA (%) <input type="number" min="0" max="100" value={form.taxRate} onChange={(e) => setF("taxRate", Number(e.target.value) || 0)} style={{ width:50, marginLeft:8 }} /></span>
                  <span>+ {fmtMoney(taxAmt, form.currency)}</span>
                </div>
                <div className={`${styles.quoteTotalRow} ${styles.quoteTotalFinal}`}>
                  <span>TOTAL</span>
                  <span>{fmtMoney(total, form.currency)}</span>
                </div>
              </div>

              {/* Conditions */}
              <p className={styles.fieldGroupLabel}>Conditions & Livraison</p>
              <div className={styles.formGrid3}>
                <label>
                  Incoterm
                  <select value={form.incoterm} onChange={(e) => setF("incoterm", e.target.value)}>
                    {["FOB","CIF","EXW","DAP","autre"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label>
                  Devise
                  <select value={form.currency} onChange={(e) => setF("currency", e.target.value)}>
                    {["USD","EUR","XOF","CNY","AED","GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Validité (jours)<input type="number" min="1" value={form.validityDays} onChange={(e) => setF("validityDays", Number(e.target.value) || 30)} /></label>
                <label>Port d'embarquement<input value={form.portOfLoading} onChange={(e) => setF("portOfLoading", e.target.value)} placeholder="Shanghai, Guangzhou…" /></label>
                <label>Port de destination<input value={form.portOfDischarge} onChange={(e) => setF("portOfDischarge", e.target.value)} placeholder="Abidjan, Dakar…" /></label>
                <label>Délai de livraison<input value={form.deliveryTime} onChange={(e) => setF("deliveryTime", e.target.value)} /></label>
              </div>
              <label>Conditions de paiement<input value={form.paymentTerms} onChange={(e) => setF("paymentTerms", e.target.value)} /></label>
              <label style={{ marginTop:12 }}>Notes internes<textarea rows={2} value={form.notes} onChange={(e) => setF("notes", e.target.value)} /></label>

              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowBuilder(false)}>Annuler</button>
                <button className={styles.btnSecondary} onClick={() => save(true)} disabled={saving}>💾 Brouillon</button>
                <button className={styles.btnPrimary} onClick={() => save(false)} disabled={saving}>
                  {saving ? "Enregistrement…" : "📨 Créer & Envoyer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: SHOWROOM (Builder)
// ══════════════════════════════════════════════════════════════════════════════
function ShowroomSection({ token, showToast }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("identite");

  useEffect(() => {
    API("/showroom/me", token)
      .then((r) => r.ok ? r.json() : {})
      .then(setData)
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key, val) => setData((p) => ({ ...p, [key]: val }));
  const setNested = (parent, key, val) => setData((p) => ({ ...p, [parent]: { ...(p[parent] || {}), [key]: val } }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await API("/showroom/me", token, { method: "PUT", body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      setData(await r.json());
      showToast("Showroom sauvegardé", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const r = await API("/showroom/me/publish", token, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).message);
      setData(await r.json());
      showToast("🎉 Showroom publié !", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const TABS = [
    { id:"identite",    label:"🎨 Identité"     },
    { id:"description", label:"📝 Description"  },
    { id:"contact",     label:"📞 Contact"       },
    { id:"horaires",    label:"🕐 Horaires"      },
    { id:"equipe",      label:"👥 Équipe"        },
    { id:"medias",      label:"📸 Médias"        },
  ];

  if (loading) return <div className={styles.loader}>Chargement…</div>;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>🏪 Mon Showroom</h2>
          <p className={styles.sectionSub}>
            {data?.isPublished
              ? <span style={{ color:"#059669" }}>✅ Publié · {fmtNum(data.viewCount)} vues</span>
              : <span style={{ color:"#f59e0b" }}>⚠️ Non publié</span>}
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className={styles.btnSecondary} onClick={save} disabled={saving}>💾 Sauvegarder</button>
          {!data?.isPublished && (
            <button className={styles.btnPrimary} onClick={publish} disabled={saving}>🚀 Publier</button>
          )}
          {data?.isPublished && (
            <Link to={`/showroom/${data.partnerId}`} target="_blank" className={styles.btnSecondary}>
              👁 Voir
            </Link>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className={styles.tabRow}>
        {TABS.map((t) => (
          <button key={t.id} className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.showroomForm}>
        {/* ── Identité ── */}
        {tab === "identite" && (
          <div className={styles.formGrid2}>
            <label>Nom de l'entreprise<input value={data?.companyName || ""} onChange={(e) => set("companyName", e.target.value)} /></label>
            <label>Slogan<input value={data?.tagline || ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Votre slogan commercial" /></label>
            <label>Année de création<input type="number" value={data?.foundedYear || ""} onChange={(e) => set("foundedYear", e.target.value)} /></label>
            <label>Nombre d'employés<input value={data?.employeesCount || ""} onChange={(e) => set("employeesCount", e.target.value)} placeholder="10-50" /></label>
            <label>Surface showroom<input value={data?.showroomSurface || ""} onChange={(e) => set("showroomSurface", e.target.value)} placeholder="500 m²" /></label>
            <label>Capacité annuelle<input value={data?.annualCapacity || ""} onChange={(e) => set("annualCapacity", e.target.value)} placeholder="200 véhicules/an" /></label>
            <label className={styles.fullCol}>Marques proposées (séparées par virgule)
              <input value={(data?.brands || []).join(", ")} onChange={(e) => set("brands", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Toyota, BMW, Mercedes…" />
            </label>
            <label className={styles.fullCol}>Pays d'export
              <input value={(data?.exportCountries || []).join(", ")} onChange={(e) => set("exportCountries", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Côte d'Ivoire, Sénégal, Mali…" />
            </label>
          </div>
        )}

        {/* ── Description ── */}
        {tab === "description" && (
          <div>
            <label>Présentation complète de l'entreprise
              <textarea rows={8} value={data?.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Décrivez votre entreprise, votre expertise, vos services…" />
            </label>
          </div>
        )}

        {/* ── Contact ── */}
        {tab === "contact" && (
          <div className={styles.formGrid2}>
            <label>Adresse<input value={data?.address || ""} onChange={(e) => set("address", e.target.value)} /></label>
            <label>Ville<input value={data?.city || ""} onChange={(e) => set("city", e.target.value)} /></label>
            <label>Pays<input value={data?.country || ""} onChange={(e) => set("country", e.target.value)} /></label>
            <label>Téléphone<input value={data?.phone || ""} onChange={(e) => set("phone", e.target.value)} /></label>
            <label>WhatsApp<input value={data?.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></label>
            <label>WeChat<input value={data?.wechat || ""} onChange={(e) => set("wechat", e.target.value)} /></label>
            <label>Email business<input type="email" value={data?.email || ""} onChange={(e) => set("email", e.target.value)} /></label>
            <label>Site web<input value={data?.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></label>
            <label>Facebook<input value={data?.social?.facebook || ""} onChange={(e) => setNested("social","facebook",e.target.value)} /></label>
            <label>LinkedIn<input value={data?.social?.linkedin || ""} onChange={(e) => setNested("social","linkedin",e.target.value)} /></label>
          </div>
        )}

        {/* ── Horaires ── */}
        {tab === "horaires" && (
          <div>
            {["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"].map((jour) => (
              <div key={jour} className={styles.hoursRow}>
                <span className={styles.hoursDay}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</span>
                <label style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="checkbox" checked={!!data?.openingHours?.[jour]?.closed}
                    onChange={(e) => setData((p) => ({ ...p, openingHours: { ...(p.openingHours||{}), [jour]: { ...(p.openingHours?.[jour]||{}), closed: e.target.checked } } }))} />
                  Fermé
                </label>
                {!data?.openingHours?.[jour]?.closed && (
                  <>
                    <input type="time" value={data?.openingHours?.[jour]?.open || "09:00"}
                      onChange={(e) => setData((p) => ({ ...p, openingHours: { ...(p.openingHours||{}), [jour]: { ...(p.openingHours?.[jour]||{}), open: e.target.value } } }))} />
                    <span>→</span>
                    <input type="time" value={data?.openingHours?.[jour]?.close || "18:00"}
                      onChange={(e) => setData((p) => ({ ...p, openingHours: { ...(p.openingHours||{}), [jour]: { ...(p.openingHours?.[jour]||{}), close: e.target.value } } }))} />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Équipe ── */}
        {tab === "equipe" && (
          <div>
            {(data?.team || []).map((m, i) => (
              <div key={i} className={styles.teamMember}>
                <div className={styles.formGrid3}>
                  <label>Nom<input value={m.name || ""} onChange={(e) => { const t = [...(data.team||[])]; t[i]={...t[i],name:e.target.value}; set("team",t); }} /></label>
                  <label>Rôle<input value={m.role || ""} onChange={(e) => { const t = [...(data.team||[])]; t[i]={...t[i],role:e.target.value}; set("team",t); }} /></label>
                  <label>Langues<input value={(m.languages||[]).join(", ")} onChange={(e) => { const t=[...(data.team||[])]; t[i]={...t[i],languages:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}; set("team",t); }} placeholder="FR, EN, AR" /></label>
                </div>
                <button className={styles.btnSmDanger} onClick={() => set("team", (data.team||[]).filter((_,j) => j !== i))}>Retirer</button>
              </div>
            ))}
            <button className={styles.btnSecondarySmall} onClick={() => set("team", [...(data.team||[]), { name:"", role:"", languages:[] }])}>
              + Ajouter un membre
            </button>
          </div>
        )}

        {/* ── Médias ── */}
        {tab === "medias" && (
          <div>
            <p className={styles.detailLabel}>Photos du showroom</p>
            <p className={styles.fieldHint}>Ajoutez les URLs de vos photos (showroom, bureau, entrepôt, équipe). Vous pourrez bientôt uploader directement.</p>
            {(data?.photos || []).map((p, i) => (
              <div key={i} className={styles.mediaRow}>
                <input value={p.url || ""} onChange={(e) => { const arr=[...(data.photos||[])]; arr[i]={...arr[i],url:e.target.value}; set("photos",arr); }} placeholder="URL de la photo" />
                <input value={p.caption || ""} onChange={(e) => { const arr=[...(data.photos||[])]; arr[i]={...arr[i],caption:e.target.value}; set("photos",arr); }} placeholder="Légende" />
                <button className={styles.btnSmDanger} onClick={() => set("photos", (data.photos||[]).filter((_,j)=>j!==i))}>✕</button>
              </div>
            ))}
            <button className={styles.btnSecondarySmall} onClick={() => set("photos", [...(data.photos||[]), { url:"", caption:"", type:"showroom" }])}>
              + Ajouter une photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: PERFORMANCE / TRUST CENTER
// ══════════════════════════════════════════════════════════════════════════════
function PerformanceSection({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/performance", token)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className={styles.loader}>Calcul du score…</div>;
  if (!data)   return <div className={styles.loader}>Erreur de chargement</div>;

  const meters = [
    { label:"Taux de complétion",       val:data.completionRate,   color:"#059669", icon:"✅" },
    { label:"Taux de conversion leads", val:data.conversionRate,   color:"#3b82f6", icon:"🎯" },
    { label:"Taux d'acceptation devis", val:data.quoteRate,        color:"#8b5cf6", icon:"📄" },
    { label:"Taux d'annulation (bas=bon)", val:100 - data.cancellationRate, color:"#f59e0b", icon:"⚡" },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>⭐ Trust Center & Performance</h2>
          <p className={styles.sectionSub}>Score calculé en temps réel par VIT AUTO</p>
        </div>
      </div>

      {/* Score global */}
      <div className={styles.trustScoreCard}>
        <div className={styles.trustScoreCircle}>
          <svg viewBox="0 0 120 120" className={styles.trustSvg}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={data.score >= 75 ? "#059669" : data.score >= 50 ? "#f59e0b" : "#dc2626"}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${2 * Math.PI * 52 * (1 - data.score / 100)}`}
              transform="rotate(-90 60 60)" />
            <text x="60" y="55" textAnchor="middle" fontSize="24" fontWeight="900" fill="#0f172a">{data.score}</text>
            <text x="60" y="72" textAnchor="middle" fontSize="11" fill="#64748b">/100</text>
          </svg>
        </div>
        <div className={styles.trustScoreInfo}>
          <h3>Score de confiance VIT AUTO</h3>
          <p className={styles.trustScoreLevel}>
            {data.score >= 85 ? "🏆 Excellent — Partenaire Premium eligible"
             : data.score >= 70 ? "⭐ Très bon — Partenaire Vérifié"
             : data.score >= 50 ? "✓ Bon — En progression"
             : "⚠️ En construction"}
          </p>
          <p className={styles.trustScoreSub}>
            Basé sur {data.totalOrders} commandes · {data.leadsTotal} leads · {data.quotesTotal} devis
          </p>
        </div>
      </div>

      {/* Métriques détaillées */}
      <div className={styles.metricsGrid}>
        {meters.map((m) => (
          <div key={m.label} className={styles.metricCard}>
            <div className={styles.metricIcon}>{m.icon}</div>
            <div className={styles.metricValue} style={{ color: m.color }}>{m.val}%</div>
            <div className={styles.metricLabel}>{m.label}</div>
            <div className={styles.metricBar}>
              <div className={styles.metricBarFill} style={{ width:`${m.val}%`, background:m.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Stats chiffres */}
      <div className={styles.trustStats}>
        {[
          { label:"Commandes totales",  val:data.totalOrders },
          { label:"Terminées",          val:data.completed },
          { label:"Annulées",           val:data.cancelled },
          { label:"Leads gagnés",       val:`${data.leadsWon} / ${data.leadsTotal}` },
          { label:"Devis acceptés",     val:`${data.quotesAccepted} / ${data.quotesTotal}` },
        ].map((s) => (
          <div key={s.label} className={styles.trustStatItem}>
            <span className={styles.trustStatVal}>{s.val}</span>
            <span className={styles.trustStatLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div className={styles.badgesSection}>
        <h3 className={styles.badgesSectionTitle}>Badges VIT AUTO</h3>
        <div className={styles.badgesGrid}>
          {[
            { icon:"✅", label:"VERIFIED",         desc:"Entreprise & documents vérifiés",      earned:data.score >= 50, gradient:"linear-gradient(135deg,#059669,#10b981)" },
            { icon:"⭐", label:"FOUNDING PARTNER",  desc:"Réservé aux 20 premiers partenaires",  earned:false, gradient:"linear-gradient(135deg,#d97706,#f59e0b)" },
            { icon:"🏆", label:"PREMIUM EXPORTER",  desc:"Score ≥ 85 + 50 commandes finalisées", earned:data.score >= 85, gradient:"linear-gradient(135deg,#7c3aed,#a855f7)" },
          ].map((b) => (
            <div key={b.label} className={`${styles.badgeCard} ${!b.earned ? styles.badgeLocked : ""}`}>
              {b.earned && <div style={{ background:b.gradient }} className={styles.badgeEarned} />}
              <span className={styles.badgeIcon}>{b.earned ? b.icon : "🔒"}</span>
              <span className={styles.badgeName}>{b.label}</span>
              <span className={styles.badgeDesc}>{b.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: SOCIÉTÉ (liens vers certification existante)
// ══════════════════════════════════════════════════════════════════════════════
function CompanySection({ user }) {
  const levels = [
    { n:1, icon:"🏢", label:"Entreprise",          route:"/partner-certification?level=1" },
    { n:2, icon:"👤", label:"Représentant",         route:"/partner-certification?level=2" },
    { n:3, icon:"📊", label:"Activité commerciale", route:"/partner-certification?level=3" },
    { n:4, icon:"🏦", label:"Compte bancaire",      route:"/partner-certification?level=4" },
    { n:5, icon:"🚗", label:"Véhicules",            route:"/partner-certification?level=5" },
    { n:6, icon:"📦", label:"Documents export",     route:"/partner-certification?level=6" },
    { n:7, icon:"📝", label:"Contrat & Charte",     route:"/partner-certification?level=7" },
    { n:8, icon:"🏅", label:"Badge final",          route:"/partner-certification?level=8" },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>🏢 Mon Entreprise</h2>
          <p className={styles.sectionSub}>Certification VIT AUTO en 8 étapes</p>
        </div>
        <Link to="/partner-certification" className={styles.btnPrimary}>Ouvrir la certification</Link>
      </div>

      <div className={styles.certLevels}>
        {levels.map((l) => (
          <Link to={l.route} key={l.n} className={styles.certLevel}>
            <div className={styles.certLevelNum}>{l.n}</div>
            <span className={styles.certLevelIcon}>{l.icon}</span>
            <span className={styles.certLevelLabel}>{l.label}</span>
            <span className={styles.certLevelArrow}>→</span>
          </Link>
        ))}
      </div>

      <div className={styles.companyLinks}>
        <Link to="/importer-apply" className={styles.companyLinkCard}>
          <span>🌍</span>
          <div>
            <strong>Profil Importateur/Exportateur</strong>
            <p>Dossier complet pour l'activité import/export internationale</p>
          </div>
          <span>→</span>
        </Link>
        <Link to="/importer-dashboard" className={styles.companyLinkCard}>
          <span>📦</span>
          <div>
            <strong>Tableau de bord Import/Export</strong>
            <p>Gérez vos annonces et transactions internationales</p>
          </div>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: FLOTTE (liens vers pages véhicules)
// ══════════════════════════════════════════════════════════════════════════════
function FleetSection() {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>🚗 Gestion de la Flotte</h2>
      </div>
      <div className={styles.fleetCards}>
        {[
          { icon:"➕", title:"Ajouter un véhicule",        desc:"Publier une nouvelle annonce",                        to:"/vendor/publish"       },
          { icon:"📋", title:"Mes annonces",               desc:"Gérer l'inventaire de mes véhicules",                 to:"/vendor/dashboard"     },
          { icon:"📊", title:"Import/Export Listings",     desc:"Mes annonces pour l'export international",           to:"/importer-dashboard"   },
          { icon:"📤", title:"Importer ma flotte",         desc:"Fichier Excel/CSV ou Google Sheet — import en masse", to:"/partner-fleet-import" },
          { icon:"🔗", title:"Synchronisation API",        desc:"Connecter votre système externe (à venir)",           soon:true                  },
        ].map((c) => (
          c.soon ? (
            <div key={c.title} className={`${styles.fleetCard} ${styles.fleetCardSoon}`}>
              <span className={styles.fleetCardIcon}>{c.icon}</span>
              <div>
                <strong>{c.title} <span className={styles.soonBadge}>Bientôt</span></strong>
                <p>{c.desc}</p>
              </div>
            </div>
          ) : (
            <Link to={c.to} key={c.title} className={styles.fleetCard}>
              <span className={styles.fleetCardIcon}>{c.icon}</span>
              <div>
                <strong>{c.title}</strong>
                <p>{c.desc}</p>
              </div>
              <span>→</span>
            </Link>
          )
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
function AnalyticsSection({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/overview", token).then((r) => r.ok ? r.json() : null).then(setData).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className={styles.loader}>Chargement des analytics…</div>;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>📊 Analytics</h2>
      </div>

      {/* KPIs détaillés */}
      <div className={styles.analyticsGrid}>
        {[
          { label:"Leads totaux",          val:data?.leadsStats?.total || 0,       icon:"🎯", color:"#3b82f6" },
          { label:"Leads gagnés",          val:data?.leadsStats?.gagne || 0,       icon:"✅", color:"#059669" },
          { label:"Leads perdus",          val:data?.leadsStats?.perdu || 0,       icon:"❌", color:"#dc2626" },
          { label:"Taux de conversion",    val:`${data?.leadsStats?.conversionRate || 0}%`, icon:"📈", color:"#059669" },
          { label:"Devis créés",           val:data?.quotesStats?.total || 0,      icon:"📄", color:"#8b5cf6" },
          { label:"Devis acceptés",        val:data?.quotesStats?.accepte || 0,    icon:"✅", color:"#059669" },
          { label:"Commandes",             val:data?.bookings?.total || 0,         icon:"📦", color:"#f59e0b" },
          { label:"Véhicules en ligne",    val:data?.vehicles?.available || 0,     icon:"🚗", color:"#0891b2" },
        ].map((k) => (
          <div key={k.label} className={styles.analyticKpi}>
            <span className={styles.analyticIcon}>{k.icon}</span>
            <span className={styles.analyticVal} style={{ color:k.color }}>{k.val}</span>
            <span className={styles.analyticLabel}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Leads par pays */}
      <h3 className={styles.analyticsSubTitle}>Répartition par pays</h3>
      <div className={styles.countryList}>
        {Object.entries(data?.leadsByCountry || {}).length === 0 ? (
          <p className={styles.emptyHint}>Aucun lead enregistré</p>
        ) : Object.entries(data?.leadsByCountry || {}).sort(([,a],[,b]) => b - a).map(([country, count]) => {
          const max = Math.max(...Object.values(data.leadsByCountry || {}).map(Number));
          return (
            <div key={country} className={styles.countryRow}>
              <span className={styles.countryName}>🌍 {country}</span>
              <div className={styles.countryBar}>
                <div style={{ width:`${(count / max) * 100}%`, height:"100%", background:"#3b82f6", borderRadius:4 }} />
              </div>
              <span className={styles.countryCount}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Graphique mensuel */}
      <h3 className={styles.analyticsSubTitle}>Leads — 6 derniers mois</h3>
      <div className={styles.chartArea}>
        {(data?.monthlyLeads || []).map((m) => {
          const max = Math.max(...(data?.monthlyLeads || []).map((x) => x.count), 1);
          return (
            <div key={m.month} className={styles.chartBarWrap}>
              <span className={styles.chartVal}>{m.count}</span>
              <div className={styles.chartBarCol}>
                <div className={styles.chartBar} style={{ height:`${(m.count / max) * 100}%` }} />
              </div>
              <span className={styles.chartMonth}>{m.month}</span>
            </div>
          );
        })}
      </div>

      {/* Lien stats admin */}
      <div style={{ marginTop:24 }}>
        <Link to="/stats" className={styles.btnSecondary}>Voir les statistiques complètes →</Link>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION: FOUNDING PARTNER ONBOARDING
// ══════════════════════════════════════════════════════════════════════════════
function OnboardingSection({ token }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    fetch("/api/partner-onboarding/my", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d.onboarding); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const STATUS_INFO = {
    brouillon:     { label: "Brouillon",               color: "#64748b", bg: "#f8fafc", icon: "📝" },
    soumis:        { label: "Soumis — En attente",     color: "#3b82f6", bg: "#eff6ff", icon: "⏳" },
    en_review:     { label: "En cours de revue",       color: "#f59e0b", bg: "#fffbeb", icon: "🔍" },
    info_demandee: { label: "Infos requises",           color: "#f97316", bg: "#fff7ed", icon: "⚠️" },
    loi_envoyee:   { label: "LOI à signer",            color: "#8b5cf6", bg: "#f5f3ff", icon: "✍️" },
    loi_signee:    { label: "LOI signée",              color: "#0891b2", bg: "#ecfeff", icon: "✅" },
    accord_envoye: { label: "Accord à signer",         color: "#8b5cf6", bg: "#f5f3ff", icon: "📜" },
    accord_signe:  { label: "Accord signé — Actif",   color: "#059669", bg: "#ecfdf5", icon: "👑" },
    actif:         { label: "Partenaire Fondateur",    color: "#059669", bg: "#ecfdf5", icon: "👑" },
    rejete:        { label: "Rejeté",                  color: "#dc2626", bg: "#fef2f2", icon: "❌" },
  };

  const STEPS = [
    { label: "Type & Infos",   done: (d) => !!d?.companyInfo?.legalName },
    { label: "Documents",      done: (d) => !!(d?.legalDocs?.businessRegistration || d?.legalDocs?.businessLicense) },
    { label: "Vérification",   done: (d) => d?.businessVerification?.brands?.length > 0 },
    { label: "Soumis",         done: (d) => !["brouillon", "info_demandee"].includes(d?.status) },
    { label: "LOI signée",     done: (d) => ["loi_signee", "accord_envoye", "accord_signe", "actif"].includes(d?.status) },
    { label: "Accord signé",   done: (d) => ["accord_signe", "actif"].includes(d?.status) },
  ];

  const status = data?.status || "brouillon";
  const si = STATUS_INFO[status] || STATUS_INFO.brouillon;
  const completion = data?.completionPercent || 0;
  const needsAction = ["loi_envoyee", "accord_envoye", "info_demandee"].includes(status);

  if (loading) return <div className={styles.loader}>Chargement…</div>;
  if (error) return <div className={styles.emptyHint}>Impossible de charger votre dossier Founding Partner. Vérifiez votre connexion et réessayez.</div>;

  return (
    <div className={styles.section}>
      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:"1rem" }}>
        <div>
          <h2 style={{ fontSize:"1.3rem", fontWeight:700, margin:"0 0 .25rem", color:"#1e293b" }}>
            👑 Programme Founding Partner
          </h2>
          <p style={{ color:"#64748b", fontSize:".88rem", margin:0 }}>
            Gérez votre candidature et suivez l'avancement de votre onboarding fondateur.
          </p>
        </div>
        <button
          onClick={() => navigate("/partner-onboarding")}
          style={{
            padding:".65rem 1.25rem", background: needsAction ? "#7c3aed" : "#1a7a8a",
            color:"white", border:"none", borderRadius:"10px", fontSize:".88rem",
            fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:".5rem",
          }}
        >
          {needsAction ? "⚡ Action requise" : "Gérer mon dossier"} →
        </button>
      </div>

      {/* ── Status + Progress ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem", marginBottom:"1.5rem" }}>
        {/* Status card */}
        <div style={{ background: si.bg, border:`1.5px solid ${si.color}20`, borderRadius:14, padding:"1.25rem" }}>
          <div style={{ display:"flex", alignItems:"center", gap:".75rem", marginBottom:".75rem" }}>
            <span style={{ fontSize:"1.8rem" }}>{si.icon}</span>
            <div>
              <div style={{ fontSize:".72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:si.color }}>
                STATUT DOSSIER
              </div>
              <div style={{ fontSize:"1rem", fontWeight:700, color:"#1e293b" }}>{si.label}</div>
            </div>
          </div>
          {data?.referenceNumber && (
            <div style={{ fontSize:".75rem", color:"#64748b", fontFamily:"monospace" }}>
              Réf. {data.referenceNumber}
            </div>
          )}
          {status === "info_demandee" && data?.adminReview?.infoRequested && (
            <div style={{ marginTop:".75rem", fontSize:".78rem", color:"#92400e", background:"#fef3c7", padding:".5rem .75rem", borderRadius:8 }}>
              <strong>Info requise :</strong> {data.adminReview.infoRequested}
            </div>
          )}
        </div>

        {/* Progress card */}
        <div style={{ background:"white", border:"1px solid #e2e8f0", borderRadius:14, padding:"1.25rem" }}>
          <div style={{ fontSize:".72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:"#64748b", marginBottom:".75rem" }}>
            COMPLÉTION DU DOSSIER
          </div>
          <div style={{ fontSize:"2.2rem", fontWeight:800, color:"#1a7a8a", marginBottom:".5rem" }}>
            {completion}%
          </div>
          <div style={{ height:10, background:"#e2e8f0", borderRadius:999, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${completion}%`, background:"linear-gradient(90deg, #f5a623, #fcd34d)", borderRadius:999, transition:"width .5s ease" }} />
          </div>
        </div>
      </div>

      {/* ── Steps progression ── */}
      <div style={{ background:"white", border:"1px solid #e2e8f0", borderRadius:14, padding:"1.25rem", marginBottom:"1.5rem" }}>
        <div style={{ fontSize:".72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:"#64748b", marginBottom:"1rem" }}>
          ÉTAPES D'ONBOARDING
        </div>
        <div style={{ display:"flex", gap:0, position:"relative" }}>
          {STEPS.map((step, i) => {
            const done = step.done(data);
            return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:".4rem", position:"relative" }}>
                {i < STEPS.length - 1 && (
                  <div style={{ position:"absolute", top:14, left:"50%", width:"100%", height:2, background: done ? "#1a7a8a" : "#e2e8f0", zIndex:0 }} />
                )}
                <div style={{
                  width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                  background: done ? "#1a7a8a" : "#f1f5f9", color: done ? "white" : "#94a3b8",
                  fontSize:".75rem", fontWeight:700, zIndex:1, border: done ? "none" : "2px solid #e2e8f0",
                  position:"relative",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                <span style={{ fontSize:".65rem", color: done ? "#1a7a8a" : "#94a3b8", textAlign:"center", fontWeight: done ? 600 : 400 }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Commissions fondateur ── */}
      {["accord_signe", "actif"].includes(status) ? (
        <div style={{ background:"linear-gradient(135deg, #0d2137, #0f3460)", color:"white", borderRadius:14, padding:"1.5rem" }}>
          <div style={{ fontSize:".72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:"#f5a623", marginBottom:".75rem" }}>
            VOS CONDITIONS FOUNDING PARTNER — VERROUILLÉES
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"1rem" }}>
            {[
              { label: "Abonnement", val: "GRATUIT", sub: "12 mois" },
              { label: "Commission Location", val: `${data?.commissions?.location || 10}%`, sub: "standard 15%" },
              { label: "Commission Vente", val: `${data?.commissions?.vente || 2}%`, sub: "standard 3%" },
              { label: "Badge", val: "👑 Fondateur", sub: "Exclusif" },
            ].map((item, i) => (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:"1.2rem", fontWeight:800, color: i === 0 ? "#4ade80" : i === 3 ? "#f5a623" : "#67e8f9" }}>
                  {item.val}
                </div>
                <div style={{ fontSize:".7rem", color:"rgba(255,255,255,.6)", marginTop:".15rem" }}>{item.label}</div>
                <div style={{ fontSize:".65rem", color:"rgba(255,255,255,.4)" }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:14, padding:"1.25rem" }}>
          <div style={{ fontSize:".72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:"#0369a1", marginBottom:".75rem" }}>
            CONDITIONS FOUNDING PARTNER (APRÈS SIGNATURE)
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"1rem" }}>
            {[
              { label: "Abonnement", val: "12 mois", sub: "GRATUIT" },
              { label: "Location", val: "10%", sub: "vs 15% standard" },
              { label: "Vente", val: "2%", sub: "vs 3% standard" },
              { label: "Badge", val: "👑", sub: "Founding Partner" },
            ].map((item, i) => (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:"1.4rem", fontWeight:800, color:"#0369a1" }}>{item.val}</div>
                <div style={{ fontSize:".7rem", color:"#0369a1", fontWeight:600 }}>{item.label}</div>
                <div style={{ fontSize:".65rem", color:"#64748b" }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA Documents à signer ── */}
      {["loi_envoyee", "accord_envoye"].includes(status) && (
        <div style={{
          marginTop:"1.5rem", padding:"1.25rem", borderRadius:14,
          background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color:"white",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:"1rem", flexWrap:"wrap",
        }}>
          <div>
            <strong style={{ fontSize:"1rem" }}>
              {status === "loi_envoyee" ? "📄 Votre LOI est prête à signer !" : "📜 L'Accord de Partenariat est prêt !"}
            </strong>
            <p style={{ fontSize:".85rem", opacity:.85, margin:".25rem 0 0" }}>
              {status === "loi_envoyee"
                ? "Signez votre Lettre d'Intention pour avancer vers l'accord de partenariat fondateur."
                : "Signez votre Accord de Partenariat pour activer votre statut Founding Partner et vos avantages."}
            </p>
          </div>
          <button
            onClick={() => navigate("/partner-onboarding")}
            style={{ padding:".7rem 1.4rem", background:"white", color:"#7c3aed", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontSize:".88rem" }}
          >
            ✍️ Signer maintenant →
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL PMS DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id:"home",        icon:"🏠", label:"Accueil"           },
  { id:"onboarding",  icon:"👑", label:"Founding Partner"  },
  { id:"company",     icon:"🏢", label:"Mon Entreprise"    },
  { id:"showroom",    icon:"🏪", label:"Mon Showroom"      },
  { id:"fleet",       icon:"🚗", label:"Flotte"            },
  { id:"leads",       icon:"🎯", label:"Leads"             },
  { id:"quotes",      icon:"📄", label:"Devis"             },
  { id:"analytics",   icon:"📊", label:"Analytics"         },
  { id:"performance", icon:"⭐", label:"Score & Trust"     },
  null, // separator
  { id:"orders",      icon:"📦", label:"Commandes",    to:"/vendor/dashboard"         },
  { id:"messages",    icon:"💬", label:"Messages",     to:"/dashboard"                },
  { id:"kyc",         icon:"🔐", label:"KYC",          to:"/kyc"                      },
  { id:"plans",       icon:"💳", label:"Abonnement",   to:"/plans"                    },
  { id:"support",     icon:"🆘", label:"Support",      to:"/help"                     },
];

export default function PartnerPMSDashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [activeSection, setActiveSection] = useState(searchParams.get("section") || "home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg, type = "info") => addToast?.(msg, type);

  const onNav = (section) => {
    setActiveSection(section);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!user) { navigate("/login?redirect=/partner-pms"); return; }
    if (!["partenaire", "admin"].includes(user.role)) { navigate("/register?role=partenaire"); }
  }, [user, navigate]);

  const renderSection = () => {
    switch (activeSection) {
      case "home":        return <HomeSection token={token} user={user} onNav={onNav} />;
      case "onboarding":  return <OnboardingSection token={token} />;
      case "company":     return <CompanySection user={user} />;
      case "showroom":    return <ShowroomSection token={token} showToast={showToast} />;
      case "fleet":       return <FleetSection />;
      case "leads":       return <LeadsSection token={token} showToast={showToast} />;
      case "quotes":      return <QuotesSection token={token} showToast={showToast} />;
      case "analytics":   return <AnalyticsSection token={token} />;
      case "performance": return <PerformanceSection token={token} />;
      default:            return <HomeSection token={token} user={user} onNav={onNav} />;
    }
  };

  const activeLabel = NAV_ITEMS.find((n) => n?.id === activeSection)?.label || "Accueil";

  return (
    <div className={styles.pms}>
      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <span className={styles.sidebarLogoIcon}>🤝</span>
            <span className={styles.sidebarLogoText}>Partner Hub</span>
          </div>
          <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {/* Infos partenaire */}
        <div className={styles.sidebarUser}>
          <div className={styles.sidebarAvatar}>{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          <div className={styles.sidebarUserInfo}>
            <span className={styles.sidebarUserName}>{user?.firstName} {user?.lastName}</span>
            <span className={styles.sidebarUserRole}>Partenaire VIT AUTO</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item, i) => {
            if (!item) return <div key={i} className={styles.navDivider} />;
            if (item.to) {
              return (
                <Link key={item.id} to={item.to} className={styles.navItem}>
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navExternal}>↗</span>
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ""}`}
                onClick={() => onNav(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to={`/showroom/${user?._id || user?.id || ""}`} className={styles.sidebarFooterLink}>👁 Mon showroom public</Link>
          <Link to="/" className={styles.sidebarFooterLink}>← Retour au site</Link>
        </div>
      </aside>

      {/* ── Overlay mobile ── */}
      {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

      {/* ── Contenu principal ── */}
      <main className={styles.main}>
        {/* Top bar mobile */}
        <div className={styles.topBar}>
          <button className={styles.menuBtn} onClick={() => setSidebarOpen(true)}>☰</button>
          <span className={styles.topBarTitle}>{activeLabel}</span>
          <div className={styles.topBarRight}>
            <Link to="/vendor/publish" className={styles.topBarAction}>+ Véhicule</Link>
          </div>
        </div>

        {/* Contenu de la section active */}
        <div className={styles.content}>
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
