import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../context/ToastContext";
import {
  SALE_LEAD_LABELS, SALE_LEAD_COLORS, PARTNER_LEAD_FILTERS, SLOT_LABELS, HISTORY_LABELS, fmtLeadDate, fmtResponseTime,
} from "../../constants/salesLeads";
import styles from "./PartnerOpportunities.module.css";

// « Mes opportunités » — dashboard partenaire (docs/vente-demande-essai.md
// §15/§16). Chaque carte propose UNIQUEMENT les actions possibles à son stade ;
// les formulaires s'ouvrent en place, jamais sur un autre écran.
const OUTCOMES = [
  { key: "completed",      label: "Essai réalisé",              testDrive: "completed" },
  { key: "no_show",        label: "Client absent",              testDrive: "no_show" },
  { key: "postponed",      label: "Essai reporté",              testDrive: "postponed" },
  { key: "interested",     label: "Client intéressé",           commercial: "interested" },
  { key: "negotiation",    label: "Négociation en cours",       commercial: "negotiation" },
  { key: "sold",           label: "Vente conclue",              sale: true },
  { key: "not_interested", label: "Client non intéressé",       commercial: "not_interested" },
  { key: "sold_elsewhere", label: "Véhicule vendu à un autre client", commercial: "sold_elsewhere" },
  { key: "other",          label: "Autre",                      commercial: "other" },
];
const CAN_ACCEPT   = ["SENT_TO_PARTNER"];
const CAN_OUTCOME  = ["PARTNER_ACCEPTED", "TEST_DRIVE_SCHEDULED", "CUSTOMER_NO_SHOW", "TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED", "NEGOTIATION"];
const CAN_SELL     = ["PARTNER_ACCEPTED", "TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED", "NEGOTIATION"];

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function PartnerOpportunities({ businessId = "" }) {
  const { authFetch } = useAuth();
  const { fmt, currency, CURRENCIES } = useCurrency();
  const { success, error: toastError } = useToast();
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState({}); // leadId → { form, data }
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = businessId ? `?businessId=${businessId}` : "";
    try {
      const [a, b] = await Promise.all([authFetch(`/api/sales-leads/partner${qs}`), authFetch(`/api/sales-leads/partner/stats${qs}`)]);
      const da = await a.json().catch(() => ({})); const db = await b.json().catch(() => ({}));
      if (a.ok) setLeads(da.leads || []);
      if (b.ok) setStats(db.stats || null);
    } catch { /* toast inutile : l'onglet reste vide avec le message ci-dessous */ }
    setLoading(false);
  }, [authFetch, businessId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const f = PARTNER_LEAD_FILTERS.find((x) => x.key === filter);
    if (!f?.statuses) return leads;
    return leads.filter((l) => f.statuses.includes(l.status));
  }, [leads, filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of PARTNER_LEAD_FILTERS) c[f.key] = f.statuses ? leads.filter((l) => f.statuses.includes(l.status)).length : leads.length;
    return c;
  }, [leads]);

  const act = async (lead, path, body, okMsg) => {
    setBusy(lead._id);
    try {
      const r = await authFetch(`/api/sales-leads/${lead._id}/${path}`, { method: "POST", body: JSON.stringify(body || {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Action impossible.");
      setLeads((ls) => ls.map((l) => (l._id === lead._id ? d.lead : l)));
      setOpen((o) => ({ ...o, [lead._id]: null }));
      if (okMsg) success(okMsg);
      authFetch(`/api/sales-leads/partner/stats${businessId ? `?businessId=${businessId}` : ""}`).then((r) => r.ok && r.json()).then((d) => d && setStats(d.stats)).catch(() => {});
    } catch (e) { toastError(e.message); } finally { setBusy(null); }
  };

  const openForm = (lead, form, data = {}) => setOpen((o) => ({ ...o, [lead._id]: { form, data } }));
  const setData = (lead, patch) => setOpen((o) => ({ ...o, [lead._id]: { ...o[lead._id], data: { ...o[lead._id].data, ...patch } } }));

  const currencyOptions = useMemo(() => {
    const codes = new Set(["USD", currency?.code || "USD", ...(CURRENCIES || []).map((c) => c.code)]);
    return [...codes].filter(Boolean);
  }, [CURRENCIES, currency]);

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h2 className={styles.h2}>🎯 Mes opportunités</h2>
          <p className={styles.sub}>Demandes d'essai apportées par VIT AUTO. Répondez sous 2 h : un client répondu vite est un client qui vient.</p>
        </div>
        <button className={styles.ghost} onClick={load} disabled={loading}>↻ Actualiser</button>
      </div>

      {stats && (
        <div className={styles.kpis}>
          {[
            ["Leads reçus", stats.leads],
            ["Demandes d'essai", stats.testDriveRequests],
            ["Essais confirmés", stats.confirmed],
            ["Essais réalisés", stats.completed],
            ["Ventes", stats.sales],
            ["Taux de conversion", `${stats.conversionRate} %`],
            ["Temps de réponse moyen", fmtResponseTime(stats.avgResponseMs)],
            ["CA via VIT AUTO", fmt(stats.revenueUSD || 0)],
            ["Commission VIT AUTO", fmt(stats.commissionUSD || 0)],
          ].map(([label, value]) => (
            <div key={label} className={styles.kpi}><span className={styles.kpiValue}>{value}</span><span className={styles.kpiLabel}>{label}</span></div>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        {PARTNER_LEAD_FILTERS.map((f) => (
          <button key={f.key} className={[styles.filter, filter === f.key ? styles.filterOn : ""].join(" ")} onClick={() => setFilter(f.key)}>
            {f.label}{counts[f.key] ? <span className={styles.count}>{counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      {loading && leads.length === 0 ? (
        <p className={styles.empty}>Chargement…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <p><strong>Aucune opportunité {filter !== "all" ? "à cette étape" : "pour le moment"}.</strong></p>
          <p>Chaque annonce en vente affiche « Demander un essai » : les demandes des clients arrivent ici, avec leurs coordonnées dès que vous acceptez.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((lead) => {
            const [bg, fg] = SALE_LEAD_COLORS[lead.status] || ["#e5e7eb", "#374151"];
            const f = open[lead._id];
            const isBusy = busy === lead._id;
            const requested = lead.requested?.date ? `${fmtLeadDate(lead.requested.date)} · ${lead.requested.slot === "custom" ? lead.requested.customSlot : SLOT_LABELS[lead.requested.slot] || ""}` : "Rappel demandé";
            const appt = lead.appointment?.date ? `${fmtLeadDate(lead.appointment.date)}${lead.appointment.time ? ` à ${lead.appointment.time}` : ""}` : null;
            const waitingSince = lead.status === "SENT_TO_PARTNER" && lead.milestones?.sentToPartnerAt ? Date.now() - new Date(lead.milestones.sentToPartnerAt).getTime() : null;
            return (
              <article key={lead._id} className={[styles.card, lead.status === "SENT_TO_PARTNER" ? styles.cardNew : ""].join(" ")}>
                <header className={styles.cardHead}>
                  {lead.listingSnapshot?.image && <img src={lead.listingSnapshot.image} alt="" className={styles.thumb} />}
                  <div className={styles.cardTitle}>
                    <strong>{lead.listingSnapshot?.title || "Véhicule"}</strong>
                    <span className={styles.meta}>{lead.reference} · {lead.client?.firstName} {lead.client?.lastName}{lead.client?.city ? ` · ${lead.client.city}` : ""}</span>
                  </div>
                  <span className={styles.badge} style={{ background: bg, color: fg }}>{SALE_LEAD_LABELS[lead.status]}</span>
                </header>

                <div className={styles.facts}>
                  <span>📅 {appt ? `RDV : ${appt}` : `Souhaité : ${requested}`}</span>
                  {lead.contactDisclosed ? (
                    <span>📞 <a href={`tel:${lead.client.phone}`}>{lead.client.phone}</a>{lead.client.whatsapp && <> · <a href={`https://wa.me/${String(lead.client.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></>}</span>
                  ) : (
                    <span title="Coordonnées transmises dès que vous acceptez la demande">🔒 {lead.client?.phone} — visibles après acceptation</span>
                  )}
                  {lead.requested?.message && <span>💬 « {lead.requested.message} »</span>}
                  {waitingSince != null && <span className={waitingSince > 2 * 3600000 ? styles.late : ""}>⏱ En attente depuis {fmtResponseTime(waitingSince)}</span>}
                  {lead.status === "ALTERNATIVE_PROPOSED" && lead.alternative?.date && <span>🔄 Proposé : {fmtLeadDate(lead.alternative.date)}{lead.alternative.time ? ` à ${lead.alternative.time}` : ""} — en attente du client</span>}
                  {lead.followUp?.response && <span>🗣 Client : {{ interested: "intéressé", offer: "souhaite faire une offre", thinking: "réfléchit encore", not_interested: "plus intéressé" }[lead.followUp.response]}</span>}
                  {lead.status === "SALE_PENDING" && <span>💰 Vente déclarée {lead.sale?.finalPrice} {lead.sale?.currency} — en attente de confirmation VIT AUTO</span>}
                  {lead.status === "SOLD" && <span>🎉 Vendu {lead.sale?.finalPrice} {lead.sale?.currency} · commission {fmt(lead.commission?.amountUSD || 0)}</span>}
                  {lead.status === "LOST" && lead.lostReason && <span>✖ {lead.lostReason}</span>}
                </div>

                {/* ── Actions selon l'étape ── */}
                {!f && (
                  <div className={styles.actions}>
                    {CAN_ACCEPT.includes(lead.status) && (
                      <>
                        <button className={styles.primary} disabled={isBusy} onClick={() => openForm(lead, "accept", { time: "", address: "", instructions: "" })}>✅ Accepter</button>
                        <button className={styles.secondary} disabled={isBusy} onClick={() => openForm(lead, "alternative", { date: "", time: "", note: "" })}>🔄 Proposer un autre créneau</button>
                        <button className={styles.danger} disabled={isBusy} onClick={() => openForm(lead, "refuse", { reason: "vehicle_unavailable", note: "" })}>Véhicule indisponible / refuser</button>
                      </>
                    )}
                    {CAN_OUTCOME.includes(lead.status) && (
                      <button className={styles.primary} disabled={isBusy} onClick={() => openForm(lead, "outcome", { key: "", note: "", newDate: "", newTime: "" })}>❓ Résultat de la demande</button>
                    )}
                    {CAN_SELL.includes(lead.status) && (
                      <button className={styles.success} disabled={isBusy} onClick={() => openForm(lead, "sale", { finalPrice: "", currency: currency?.code || "USD", soldAt: todayISO() })}>💰 Vente conclue</button>
                    )}
                    <button className={styles.ghost} onClick={() => openForm(lead, "history")}>Historique</button>
                  </div>
                )}

                {f?.form === "accept" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Confirmer l'essai du {requested}</p>
                    <div className={styles.row}>
                      <label>Heure<input type="time" value={f.data.time} onChange={(e) => setData(lead, { time: e.target.value })} /></label>
                      <label>Lieu du rendez-vous<input value={f.data.address} onChange={(e) => setData(lead, { address: e.target.value })} placeholder="Adresse de l'agence" /></label>
                    </div>
                    <label>Instructions pour le client (facultatif)<input value={f.data.instructions} onChange={(e) => setData(lead, { instructions: e.target.value })} placeholder="Ex : apporter votre permis" /></label>
                    <div className={styles.actions}>
                      <button className={styles.primary} disabled={isBusy} onClick={() => act(lead, "accept", f.data, "Essai confirmé — le client est prévenu.")}>Confirmer</button>
                      <button className={styles.ghost} onClick={() => openForm(lead, null)}>Annuler</button>
                    </div>
                  </div>
                )}

                {f?.form === "alternative" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Proposer un autre créneau</p>
                    <div className={styles.row}>
                      <label>Date<input type="date" min={todayISO()} value={f.data.date} onChange={(e) => setData(lead, { date: e.target.value })} /></label>
                      <label>Heure<input type="time" value={f.data.time} onChange={(e) => setData(lead, { time: e.target.value })} /></label>
                    </div>
                    <label>Message (facultatif)<input value={f.data.note} onChange={(e) => setData(lead, { note: e.target.value })} placeholder="Ex : le véhicule est en préparation le matin" /></label>
                    <div className={styles.actions}>
                      <button className={styles.primary} disabled={isBusy || !f.data.date} onClick={() => act(lead, "propose-alternative", f.data, "Créneau proposé — le client doit confirmer.")}>Envoyer au client</button>
                      <button className={styles.ghost} onClick={() => openForm(lead, null)}>Annuler</button>
                    </div>
                  </div>
                )}

                {f?.form === "refuse" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Refuser la demande</p>
                    <label>Motif
                      <select value={f.data.reason} onChange={(e) => setData(lead, { reason: e.target.value })}>
                        <option value="vehicle_unavailable">Véhicule indisponible / déjà vendu</option>
                        <option value="other">Autre motif</option>
                      </select>
                    </label>
                    {f.data.reason === "other" && <label>Précision<input value={f.data.note} onChange={(e) => setData(lead, { note: e.target.value })} /></label>}
                    <div className={styles.actions}>
                      <button className={styles.danger} disabled={isBusy} onClick={() => act(lead, "refuse", f.data, "Demande refusée.")}>Confirmer le refus</button>
                      <button className={styles.ghost} onClick={() => openForm(lead, null)}>Annuler</button>
                    </div>
                  </div>
                )}

                {f?.form === "outcome" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Quel est le résultat de cette demande ?</p>
                    <div className={styles.chips}>
                      {OUTCOMES.filter((o) => lead.requestType === "test_drive" || !o.testDrive).map((o) => (
                        <button key={o.key} type="button" className={[styles.chip, f.data.key === o.key ? styles.chipOn : ""].join(" ")}
                          onClick={() => o.sale ? openForm(lead, "sale", { finalPrice: "", currency: currency?.code || "USD", soldAt: todayISO() }) : setData(lead, { key: o.key })}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {f.data.key === "postponed" && (
                      <div className={styles.row}>
                        <label>Nouvelle date<input type="date" min={todayISO()} value={f.data.newDate} onChange={(e) => setData(lead, { newDate: e.target.value })} /></label>
                        <label>Heure<input type="time" value={f.data.newTime} onChange={(e) => setData(lead, { newTime: e.target.value })} /></label>
                      </div>
                    )}
                    <label>Note (facultatif)<input value={f.data.note} onChange={(e) => setData(lead, { note: e.target.value })} /></label>
                    <div className={styles.actions}>
                      <button className={styles.primary} disabled={isBusy || !f.data.key || (f.data.key === "postponed" && !f.data.newDate)}
                        onClick={() => {
                          const o = OUTCOMES.find((x) => x.key === f.data.key);
                          act(lead, "outcome", { testDrive: o.testDrive, commercial: o.commercial, note: f.data.note, newDate: f.data.newDate, newTime: f.data.newTime }, "Résultat enregistré.");
                        }}>Enregistrer</button>
                      <button className={styles.ghost} onClick={() => openForm(lead, null)}>Annuler</button>
                    </div>
                  </div>
                )}

                {f?.form === "sale" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Déclarer la vente conclue</p>
                    <div className={styles.row}>
                      <label>Prix de vente final<input type="number" min="1" inputMode="decimal" value={f.data.finalPrice} onChange={(e) => setData(lead, { finalPrice: e.target.value })} /></label>
                      <label>Devise
                        <select value={f.data.currency} onChange={(e) => setData(lead, { currency: e.target.value })}>
                          {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label>Date de vente<input type="date" max={todayISO()} value={f.data.soldAt} onChange={(e) => setData(lead, { soldAt: e.target.value })} /></label>
                    </div>
                    <p className={styles.hint}>Commission VIT AUTO : 3 % du prix de vente final, due uniquement pour une vente issue de ce prospect dans la fenêtre d'attribution ({lead.attribution?.windowDays || 90} jours). VIT AUTO confirme la vente avant facturation.</p>
                    <div className={styles.actions}>
                      <button className={styles.success} disabled={isBusy || !(Number(f.data.finalPrice) > 0)} onClick={() => act(lead, "declare-sale", f.data, "Vente déclarée — en attente de confirmation VIT AUTO.")}>Déclarer la vente</button>
                      <button className={styles.ghost} onClick={() => openForm(lead, null)}>Annuler</button>
                    </div>
                  </div>
                )}

                {f?.form === "history" && (
                  <div className={styles.form}>
                    <p className={styles.formTitle}>Historique</p>
                    <ol className={styles.timeline}>
                      {[...(lead.history || [])].reverse().map((h, i) => (
                        <li key={i}><span>{fmtLeadDate(h.timestamp, true)}</span>{HISTORY_LABELS[h.action] || h.action}</li>
                      ))}
                    </ol>
                    <button className={styles.ghost} onClick={() => openForm(lead, null)}>Fermer</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
