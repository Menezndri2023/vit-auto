import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../context/ToastContext";
import {
  SALE_LEAD_LABELS, SALE_LEAD_COLORS, SLOT_LABELS, HISTORY_LABELS, fmtLeadDate, fmtResponseTime,
} from "../../constants/salesLeads";
import styles from "./AdminSalesLeads.module.css";

// Onglet admin « Leads vente » (docs/vente-demande-essai.md §17) : funnel
// complet, filtres, et fiche de chaque lead avec son historique horodaté.
const STATUSES = Object.keys(SALE_LEAD_LABELS);
const LEVEL_LABELS = { 1: "Niv. 1 — standard", 2: "Niv. 2 — important", 3: "Niv. 3 — forte valeur" };

export default function AdminSalesLeads() {
  const { authFetch } = useAuth();
  const { fmt } = useCurrency();
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();
  const [funnel, setFunnel] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", stage: "", level: "", city: "", search: "", from: "", to: "", minPrice: "", maxPrice: "" });
  const [selectedId, setSelectedId] = useState(params.get("lead") || null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ status: "", reason: "", level: "", internalNotes: "" });

  const query = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    return q.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([authFetch(`/api/sales-leads/admin?${query}`), authFetch("/api/sales-leads/admin/funnel")]);
      const da = await a.json().catch(() => ({})); const db = await b.json().catch(() => ({}));
      if (a.ok) setLeads(da.leads || []);
      if (b.ok) setFunnel(db);
    } catch { /* l'onglet reste vide */ }
    setLoading(false);
  }, [authFetch, query]);

  useEffect(() => { load(); }, [load]);

  const openLead = useCallback(async (id) => {
    setSelectedId(id);
    setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("lead", id); else n.delete("lead"); return n; }, { replace: true });
    if (!id) { setDetail(null); return; }
    try {
      const r = await authFetch(`/api/sales-leads/${id}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setDetail(d.lead); setForm({ status: d.lead.status, reason: "", level: String(d.lead.qualification?.level || 1), internalNotes: d.lead.internalNotes || "" }); }
      else toastError(d.message || "Lead introuvable.");
    } catch { toastError("Lead introuvable."); }
  }, [authFetch, setParams, toastError]);

  useEffect(() => { if (selectedId && !detail) openLead(selectedId); }, [selectedId, detail, openLead]);

  const act = async (path, body, okMsg) => {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await authFetch(`/api/sales-leads/${detail._id}/admin/${path}`, { method: "POST", body: JSON.stringify(body || {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Action impossible.");
      setDetail(d.lead);
      setLeads((ls) => ls.map((l) => (l._id === d.lead._id ? { ...l, ...d.lead, partner: l.partner } : l)));
      if (okMsg) success(okMsg);
      authFetch("/api/sales-leads/admin/funnel").then((r) => r.ok && r.json()).then((d) => d && setFunnel(d)).catch(() => {});
    } catch (e) { toastError(e.message); } finally { setBusy(false); }
  };

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const [bg, fg] = SALE_LEAD_COLORS[detail?.status] || ["#e5e7eb", "#374151"];

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h2 className={styles.h2}>🎯 Leads vente — demandes d'essai</h2>
          <p className={styles.sub}>Visibilité → prospect → demande d'essai → rendez-vous → essai → opportunité → vente. Commission 3 % due uniquement sur une vente conclue dans la fenêtre d'attribution.</p>
        </div>
        <button className={styles.ghost} onClick={load} disabled={loading}>↻ Actualiser</button>
      </div>

      {funnel && (
        <>
          <div className={styles.funnel}>
            {funnel.funnel.map((s, i) => (
              <button key={s.key} className={[styles.stage, filters.stage === s.key ? styles.stageOn : ""].join(" ")}
                onClick={() => setFilters((f) => ({ ...f, stage: f.stage === s.key ? "" : s.key, status: "" }))}>
                <span className={styles.stageCount}>{s.count}</span>
                <span className={styles.stageLabel}>{s.label}</span>
                {i > 0 && funnel.funnel[i - 1].count > 0 && <span className={styles.stageRate}>{Math.round((s.count / funnel.funnel[i - 1].count) * 100)} %</span>}
              </button>
            ))}
          </div>
          <div className={styles.kpis}>
            {[
              ["À qualifier", funnel.pendingQualification, funnel.pendingQualification > 0],
              ["Ventes à confirmer", funnel.pendingSales, funnel.pendingSales > 0],
              ["Taux de conversion", `${funnel.stats?.conversionRate ?? 0} %`],
              ["Réponse partenaire (moy.)", fmtResponseTime(funnel.stats?.avgResponseMs)],
              ["CA généré", fmt(funnel.stats?.revenueUSD || 0)],
              ["Commissions", fmt(funnel.stats?.commissionUSD || 0)],
            ].map(([label, value, alert]) => (
              <div key={label} className={[styles.kpi, alert ? styles.kpiAlert : ""].join(" ")}><span className={styles.kpiValue}>{value}</span><span className={styles.kpiLabel}>{label}</span></div>
            ))}
          </div>
        </>
      )}

      <div className={styles.filters}>
        <input placeholder="Référence, client, téléphone, véhicule…" value={filters.search} onChange={setF("search")} />
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, stage: "" }))}>
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s} value={s}>{SALE_LEAD_LABELS[s]}</option>)}
        </select>
        <select value={filters.level} onChange={setF("level")}>
          <option value="">Tous niveaux</option>
          {[1, 2, 3].map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
        </select>
        <input placeholder="Ville" value={filters.city} onChange={setF("city")} />
        <input type="date" value={filters.from} onChange={setF("from")} title="Du" />
        <input type="date" value={filters.to} onChange={setF("to")} title="Au" />
        <input type="number" placeholder="Prix min (USD)" value={filters.minPrice} onChange={setF("minPrice")} />
        <input type="number" placeholder="Prix max (USD)" value={filters.maxPrice} onChange={setF("maxPrice")} />
      </div>

      <div className={styles.split}>
        <div className={styles.tableWrap}>
          {loading && leads.length === 0 ? <p className={styles.empty}>Chargement…</p> : leads.length === 0 ? <p className={styles.empty}>Aucun lead pour ces filtres.</p> : (
            <table className={styles.table}>
              <thead><tr><th>Référence</th><th>Client</th><th>Véhicule</th><th>Partenaire</th><th>Niv.</th><th>Statut</th><th>Créé</th></tr></thead>
              <tbody>
                {leads.map((l) => {
                  const [b, f] = SALE_LEAD_COLORS[l.status] || ["#e5e7eb", "#374151"];
                  return (
                    <tr key={l._id} className={selectedId === l._id ? styles.rowOn : ""} onClick={() => openLead(l._id)}>
                      <td className={styles.mono}>{l.reference}</td>
                      <td>{l.client?.firstName} {l.client?.lastName}<br /><small>{l.client?.city || "—"}</small></td>
                      <td>{l.listingSnapshot?.title}<br /><small>{l.listingSnapshot?.priceUSD ? fmt(l.listingSnapshot.priceUSD) : "—"}</small></td>
                      <td>{l.partner?.firstName} {l.partner?.lastName}</td>
                      <td><span className={[styles.level, l.qualification?.level === 3 ? styles.level3 : l.qualification?.level === 2 ? styles.level2 : ""].join(" ")}>{l.qualification?.level}</span></td>
                      <td><span className={styles.badge} style={{ background: b, color: f }}>{SALE_LEAD_LABELS[l.status]}</span></td>
                      <td><small>{fmtLeadDate(l.createdAt)}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {detail && (
          <aside className={styles.detail}>
            <div className={styles.detailHead}>
              <div>
                <p className={styles.mono}>{detail.reference} · {detail.requestType === "callback" ? "Rappel" : "Essai"} · {LEVEL_LABELS[detail.qualification?.level]}</p>
                <h3 className={styles.h3}>{detail.listingSnapshot?.title}</h3>
                <span className={styles.badge} style={{ background: bg, color: fg }}>{SALE_LEAD_LABELS[detail.status]}</span>
              </div>
              <button className={styles.ghost} onClick={() => openLead(null)} aria-label="Fermer">×</button>
            </div>

            <dl className={styles.dl}>
              <dt>Client</dt><dd>{detail.client?.firstName} {detail.client?.lastName} · <a href={`tel:${detail.client?.phone}`}>{detail.client?.phone}</a>{detail.client?.whatsapp && detail.client.whatsapp !== detail.client.phone ? ` · WA ${detail.client.whatsapp}` : ""}{detail.client?.email ? ` · ${detail.client.email}` : ""}<br /><small>{detail.client?.city || "—"} {detail.client?.country ? `(${detail.client.country})` : ""} · {detail.client?.userId ? "compte client" : "invité"}</small></dd>
              <dt>Partenaire</dt><dd>{detail.partner?.firstName} {detail.partner?.lastName}<br /><small>{detail.partner?.email} · {detail.partner?.phone || "—"}</small></dd>
              <dt>Véhicule</dt><dd>{detail.listingSnapshot?.title} · {detail.listingSnapshot?.priceUSD ? fmt(detail.listingSnapshot.priceUSD) : "—"} · {detail.listingSnapshot?.ville || "—"}</dd>
              <dt>Souhait</dt><dd>{detail.requested?.date ? `${fmtLeadDate(detail.requested.date)} — ${detail.requested.slot === "custom" ? detail.requested.customSlot : SLOT_LABELS[detail.requested.slot]}` : "Rappel"}{detail.requested?.message ? <><br /><small>« {detail.requested.message} »</small></> : null}</dd>
              {detail.qualification?.reasons?.length > 0 && <><dt>Signaux</dt><dd>{detail.qualification.reasons.join(", ")}</dd></>}
              {detail.appointment?.date && <><dt>Rendez-vous</dt><dd>{fmtLeadDate(detail.appointment.date)}{detail.appointment.time ? ` à ${detail.appointment.time}` : ""}{detail.appointment.address ? ` · ${detail.appointment.address}` : ""}</dd></>}
              {detail.sla?.responseTimeMs != null && <><dt>Réponse partenaire</dt><dd>{fmtResponseTime(detail.sla.responseTimeMs)}</dd></>}
              {detail.outcome?.testDrive || detail.outcome?.commercial ? <><dt>Résultat</dt><dd>{[detail.outcome.testDrive, detail.outcome.commercial].filter(Boolean).join(" · ")}{detail.outcome.note ? <><br /><small>{detail.outcome.note}</small></> : null}</dd></> : null}
              {detail.followUp?.response && <><dt>Suivi client</dt><dd>{detail.followUp.response}</dd></>}
              {detail.sale?.finalPrice && <><dt>Vente</dt><dd>{detail.sale.finalPrice} {detail.sale.currency} (≈ {fmt(detail.sale.finalPriceUSD || 0)}) le {fmtLeadDate(detail.sale.soldAt)}<br /><small>Commission {Math.round((detail.commission?.rate || 0) * 10000) / 100} % = {fmt(detail.commission?.amountUSD || 0)} · {detail.commission?.dueWithinAttribution ? "dans la fenêtre d'attribution" : "HORS fenêtre d'attribution"}</small></dd></>}
              <dt>Attribution</dt><dd>{detail.attribution?.windowDays} jours · expire le {fmtLeadDate(detail.attribution?.expiresAt)}</dd>
              {detail.lostReason && <><dt>Perdu</dt><dd>{detail.lostReason}</dd></>}
              {detail.partnerNotes && <><dt>Note partenaire</dt><dd>{detail.partnerNotes}</dd></>}
            </dl>

            {/* ── Actions ── */}
            {["NEW", "QUALIFYING"].includes(detail.status) && (
              <div className={styles.actionBox}>
                <strong>Qualification</strong>
                <div className={styles.row}>
                  <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}>
                    {[1, 2, 3].map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                  </select>
                  <button className={styles.primary} disabled={busy} onClick={() => act("qualify", { level: Number(form.level), transmit: true }, "Lead transmis au partenaire.")}>Valider et transmettre</button>
                </div>
              </div>
            )}
            {detail.status === "SALE_PENDING" && (
              <div className={styles.actionBox}>
                <strong>Vente déclarée par le partenaire</strong>
                <div className={styles.row}>
                  <button className={styles.success} disabled={busy} onClick={() => act("confirm-sale", {}, "Vente confirmée — commission enregistrée.")}>Confirmer la vente</button>
                  <input placeholder="Motif de rejet" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                  <button className={styles.danger} disabled={busy} onClick={() => act("reject-sale", { reason: form.reason }, "Déclaration rejetée.")}>Rejeter</button>
                </div>
              </div>
            )}
            <div className={styles.actionBox}>
              <strong>Intervention VIT AUTO</strong>
              <div className={styles.row}>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUSES.filter((s) => s !== "SOLD").map((s) => <option key={s} value={s}>{SALE_LEAD_LABELS[s]}</option>)}
                </select>
                <input placeholder="Motif" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                <button className={styles.secondary} disabled={busy || form.status === detail.status} onClick={() => act("status", { status: form.status, reason: form.reason }, "Statut modifié.")}>Appliquer</button>
              </div>
              <div className={styles.row}>
                <textarea rows={2} placeholder="Notes internes VIT AUTO" value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} />
                <button className={styles.secondary} disabled={busy} onClick={() => act("assign", { internalNotes: form.internalNotes }, "Dossier pris en charge.")}>Prendre en charge / enregistrer</button>
              </div>
            </div>

            <div className={styles.actionBox}>
              <strong>Historique complet</strong>
              <ol className={styles.timeline}>
                {[...(detail.history || [])].reverse().map((h, i) => (
                  <li key={i}>
                    <span>{fmtLeadDate(h.timestamp, true)} · {h.actorType}{h.source ? ` · ${h.source}` : ""}</span>
                    {HISTORY_LABELS[h.action] || h.action}{h.from && h.to && h.from !== h.to ? ` (${SALE_LEAD_LABELS[h.from]} → ${SALE_LEAD_LABELS[h.to]})` : ""}
                    {h.metadata?.reason ? <small> — {h.metadata.reason}</small> : null}
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
