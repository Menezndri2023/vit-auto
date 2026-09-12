import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCustomerServiceContact } from "../utils/customerServiceContact";
import { SALE_LEAD_LABELS, SALE_LEAD_COLORS, SLOT_LABELS, HISTORY_LABELS, fmtLeadDate } from "../constants/salesLeads";
import styles from "./TestDriveLead.module.css";

// Suivi d'une demande d'essai côté client (docs/vente-demande-essai.md §5, §6,
// §10) — accessible connecté (compte propriétaire) ou par le lien signé reçu
// par SMS/WhatsApp/e-mail (`?t=`), sans créer de compte.
const SLOTS = [["morning", "Matin"], ["afternoon", "Après-midi"], ["evening", "Soir"], ["custom", "Autre"]];
const TERMINAL = ["SOLD", "LOST", "CANCELLED"];
const CANCELABLE = ["NEW", "QUALIFYING", "SENT_TO_PARTNER", "PARTNER_ACCEPTED", "ALTERNATIVE_PROPOSED", "CUSTOMER_CONFIRMED", "TEST_DRIVE_SCHEDULED"];
const FOLLOW_UP_OK = ["TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED", "NEGOTIATION", "CUSTOMER_NO_SHOW"];

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function TestDriveLead() {
  const { reference } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t");
  const { isAuthenticated, authFetch, authReady } = useAuth();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [otherSlot, setOtherSlot] = useState(null); // { date, slot, customSlot }
  const [cancelling, setCancelling] = useState(false);

  const call = useCallback(async (path, options = {}) => {
    const q = token ? `?t=${encodeURIComponent(token)}` : "";
    const url = `/api/sales-leads/public/${encodeURIComponent(reference)}${path}${q}`;
    const doFetch = isAuthenticated ? authFetch : (u, o) => fetch(u, { ...o, headers: { "Content-Type": "application/json", ...o.headers } });
    const res = await doFetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Une erreur est survenue.");
    return data;
  }, [reference, token, isAuthenticated, authFetch]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setLoading(true);
    call("")
      .then((d) => { if (!cancelled) setLead(d.lead); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [call, authReady]);

  const act = async (path, body) => {
    setBusy(true); setError("");
    try {
      const d = await call(path, { method: "POST", body: JSON.stringify(body || {}) });
      setLead(d.lead);
      setOtherSlot(null); setCancelling(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const service = useMemo(() => getCustomerServiceContact(lead?.listingSnapshot?.country), [lead]);
  const [bg, fg] = SALE_LEAD_COLORS[lead?.status] || ["#e5e7eb", "#374151"];
  const isPast = lead?.appointment?.endAt && new Date(lead.appointment.endAt) < new Date();
  const showFollowUp = lead && FOLLOW_UP_OK.includes(lead.status) && !lead.followUp?.response && (lead.status !== "TEST_DRIVE_SCHEDULED" || isPast);

  if (loading) return <div className={styles.page}><div className={styles.card}>Chargement…</div></div>;
  if (!lead) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.h1}>Dossier introuvable</h1>
          <p className={styles.muted}>{error || "Ce lien n'est plus valide."} {!isAuthenticated && <>Si vous avez un compte, <Link to={`/login?next=/essai/${reference}`}>connectez-vous</Link>.</>}</p>
          <Link to="/catalogue" className={styles.primary}>Voir les véhicules</Link>
        </div>
      </div>
    );
  }

  const v = lead.listingSnapshot || {};
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.head}>
          {v.image && <img src={v.image} alt="" className={styles.thumb} />}
          <div>
            <p className={styles.ref}>{lead.requestType === "callback" ? "Demande de rappel" : "Demande d'essai"} · {lead.reference}</p>
            <h1 className={styles.h1}>{v.title}</h1>
            <p className={styles.muted}>{[v.ville, v.annee].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <span className={styles.badge} style={{ background: bg, color: fg }}>{SALE_LEAD_LABELS[lead.status] || lead.status}</span>

        {/* ── Rendez-vous ── */}
        {lead.appointment?.date && !["CANCELLED", "LOST"].includes(lead.status) && (
          <section className={styles.section}>
            <h2 className={styles.h2}>📅 Votre rendez-vous</h2>
            <p className={styles.big}>{fmtLeadDate(lead.appointment.date)}{lead.appointment.time ? ` à ${lead.appointment.time}` : ""}</p>
            {lead.appointment.address && <p className={styles.line}>📍 {lead.appointment.address}</p>}
            {lead.appointment.instructions && <p className={styles.line}>ℹ️ {lead.appointment.instructions}</p>}
            <p className={styles.line}>☎️ Service client VIT AUTO : <a href={`tel:${service.tel}`}>{service.display}</a></p>
          </section>
        )}

        {/* ── Créneau proposé par le vendeur ── */}
        {lead.status === "ALTERNATIVE_PROPOSED" && lead.alternative?.date && (
          <section className={`${styles.section} ${styles.highlight}`}>
            <h2 className={styles.h2}>🔄 Le vendeur vous propose un nouveau créneau</h2>
            <p className={styles.big}>{fmtLeadDate(lead.alternative.date)}{lead.alternative.time ? ` à ${lead.alternative.time}` : lead.alternative.slot ? ` (${SLOT_LABELS[lead.alternative.slot] || lead.alternative.slot})` : ""}</p>
            {lead.alternative.note && <p className={styles.line}>« {lead.alternative.note} »</p>}
            {!otherSlot ? (
              <div className={styles.actions}>
                <button className={styles.primary} disabled={busy} onClick={() => act("/alternative", { accept: true })}>Accepter</button>
                <button className={styles.secondary} disabled={busy} onClick={() => setOtherSlot({ date: "", slot: "", customSlot: "" })}>Choisir un autre créneau</button>
              </div>
            ) : (
              <div className={styles.form}>
                <label className={styles.field}><span>Nouvelle date</span><input type="date" min={todayISO()} value={otherSlot.date} onChange={(e) => setOtherSlot({ ...otherSlot, date: e.target.value })} /></label>
                <div className={styles.chips}>
                  {SLOTS.map(([k, l]) => (
                    <button key={k} type="button" className={[styles.chip, otherSlot.slot === k ? styles.chipOn : ""].join(" ")} onClick={() => setOtherSlot({ ...otherSlot, slot: k })}>{l}</button>
                  ))}
                </div>
                {otherSlot.slot === "custom" && <input className={styles.input} placeholder="Ex : samedi vers 11 h" value={otherSlot.customSlot} onChange={(e) => setOtherSlot({ ...otherSlot, customSlot: e.target.value })} />}
                <div className={styles.actions}>
                  <button className={styles.primary} disabled={busy || !otherSlot.date || !otherSlot.slot} onClick={() => act("/alternative", { accept: false, newDate: otherSlot.date, newSlot: otherSlot.slot, customSlot: otherSlot.customSlot })}>Envoyer au vendeur</button>
                  <button className={styles.secondary} disabled={busy} onClick={() => setOtherSlot(null)}>Retour</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Suivi après l'essai ── */}
        {showFollowUp && (
          <section className={`${styles.section} ${styles.highlight}`}>
            <h2 className={styles.h2}>Souhaitez-vous poursuivre votre projet d'achat ?</h2>
            <p className={styles.muted}>Nous espérons que votre essai s'est bien passé. Votre réponse est transmise au vendeur.</p>
            <div className={styles.grid2}>
              <button className={styles.primary} disabled={busy} onClick={() => act("/follow-up", { response: "interested" })}>Je suis intéressé</button>
              <button className={styles.primary} disabled={busy} onClick={() => act("/follow-up", { response: "offer" })}>Je souhaite faire une offre</button>
              <button className={styles.secondary} disabled={busy} onClick={() => act("/follow-up", { response: "thinking" })}>Je réfléchis encore</button>
              <button className={styles.secondary} disabled={busy} onClick={() => act("/follow-up", { response: "not_interested" })}>Je ne suis plus intéressé</button>
            </div>
          </section>
        )}
        {lead.followUp?.response && (
          <p className={styles.muted}>Votre réponse : <strong>{{ interested: "intéressé", offer: "souhaite faire une offre", thinking: "réfléchit encore", not_interested: "plus intéressé" }[lead.followUp.response]}</strong>. {["interested", "offer"].includes(lead.followUp.response) && "Le vendeur vous contacte pour la suite."}</p>
        )}

        {/* ── Demande initiale ── */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Votre demande</h2>
          {lead.requested?.date && <p className={styles.line}>Souhaité : {fmtLeadDate(lead.requested.date)} — {lead.requested.slot === "custom" ? lead.requested.customSlot : SLOT_LABELS[lead.requested.slot]}</p>}
          {lead.requested?.message && <p className={styles.line}>« {lead.requested.message} »</p>}
          <p className={styles.line}>Contact : {lead.client?.firstName} {lead.client?.lastName} · {lead.client?.phone}{lead.client?.city ? ` · ${lead.client.city}` : ""}</p>
          {lead.status === "LOST" && lead.lostReason && <p className={styles.line}>Motif : {lead.lostReason}</p>}
        </section>

        {/* ── Historique ── */}
        {lead.history?.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.h2}>Historique</h2>
            <ol className={styles.timeline}>
              {[...lead.history].reverse().map((h, i) => (
                <li key={i}><span>{fmtLeadDate(h.timestamp, true)}</span>{HISTORY_LABELS[h.action] || h.action}</li>
              ))}
            </ol>
          </section>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

        {CANCELABLE.includes(lead.status) && !TERMINAL.includes(lead.status) && (
          !cancelling ? (
            <button className={styles.link} disabled={busy} onClick={() => setCancelling(true)}>Annuler ma demande</button>
          ) : (
            <div className={styles.actions}>
              <button className={styles.danger} disabled={busy} onClick={() => act("/cancel", { reason: "Annulée par le client" })}>Confirmer l'annulation</button>
              <button className={styles.secondary} disabled={busy} onClick={() => setCancelling(false)}>Garder ma demande</button>
            </div>
          )
        )}

        <p className={styles.footnote}>
          La vente se conclut directement avec le vendeur. VIT AUTO vous accompagne et reste joignable au <a href={`tel:${service.tel}`}>{service.display}</a>.
          {isAuthenticated && <> · <Link to="/dashboard">Mon espace</Link></>}
        </p>
      </div>
    </div>
  );
}
