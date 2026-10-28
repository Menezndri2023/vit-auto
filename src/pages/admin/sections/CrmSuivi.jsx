import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// CRM partenaires — blocs de suivi commercial (2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Branchés dans l'onglet « CRM Partenaires » d'AdminPanel, sur les routes
// existantes /api/partner-crm/admin/* : journal des échanges, prochaine action,
// abandon motivé, doublons possibles, activation réelle du compte lié.
// Rien n'est inventé : un bloc sans donnée le dit.

const CANAUX = { whatsapp: "WhatsApp", wechat: "WeChat", email: "E-mail", phone: "Téléphone", meeting: "Rendez-vous", other: "Autre" };
const ACTIVATION = {
  inscrit:  { l: "Inscrit",  c: "#64748b", bg: "#f1f5f9" },
  verifie:  { l: "Vérifié",  c: "#0284c7", bg: "#e0f2fe" },
  active:   { l: "Activé",   c: "#15803d", bg: "#dcfce7" },
  suspendu: { l: "Suspendu", c: "#b91c1c", bg: "#fee2e2" },
};
const MANQUE = { profilComplet: "profil", verifie: "documents", offresExploitables: "offre", joignable: "contact" };
const champ = { width: "100%", padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".8rem", boxSizing: "border-box", fontFamily: "inherit" };
const titre = { fontSize: ".78rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 6px" };
const boite = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 12 };
const fmtJour = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

// Échéance dépassée ou du jour : à traiter.
const enRetard = (d) => {
  if (!d) return false;
  const fin = new Date(); fin.setHours(23, 59, 59, 999);
  return new Date(d) <= fin;
};

export function BadgeActivation({ activation }) {
  if (!activation) return <span style={{ color: "#94a3b8" }}>—</span>;
  const a = ACTIVATION[activation.statut] || ACTIVATION.inscrit;
  const manque = (activation.manquants || []).map((m) => MANQUE[m.code || m] || m).join(", ");
  return (
    <span title={manque ? `Manque : ${manque}` : "Tous les critères sont remplis"}
      style={{ display: "inline-block", fontSize: ".72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: a.bg, color: a.c }}>
      {a.l}
    </span>
  );
}

export function ProchaineAction({ libelle, echeance }) {
  if (!libelle && !echeance) return <span style={{ color: "#94a3b8" }}>—</span>;
  const retard = enRetard(echeance);
  return (
    <span style={{ color: retard ? "#b91c1c" : "#334155", fontWeight: retard ? 700 : 400 }}>
      {libelle || "Suivi"}{echeance ? ` · ${fmtJour(echeance)}` : ""}{retard ? " ⏰" : ""}
    </span>
  );
}

export function BlocActivation({ activation }) {
  if (!activation) return null;
  const d = activation.premieresDemandes || {};
  return (
    <div style={boite}>
      <p style={titre}>Activation réelle du compte <BadgeActivation activation={activation} /></p>
      <p style={{ margin: 0, fontSize: ".76rem", color: "#475569" }}>
        {activation.manquants?.length ? `Manque : ${activation.manquants.map((m) => m.libelle).join(" · ")}` : "Profil complet, documents vérifiés, offre exploitable, contact vérifié."}
        <br />{activation.offres?.total ?? 0} offre(s) exploitable(s) · {d.recues ?? 0} demande(s) reçue(s), {d.repondues ?? 0} traitée(s)
      </p>
    </div>
  );
}

export function BlocDoublons({ doublons, titre: t = "Correspondances possibles" }) {
  if (!doublons?.length) return null;
  const MOTIF = { contactEmail: "même e-mail", email: "même e-mail", contactTel: "même téléphone", phone: "même téléphone", entreprise: "même nom" };
  return (
    <div style={{ ...boite, background: "#fffbeb", borderColor: "#fde68a" }}>
      <p style={titre}>⚠️ {t}</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".76rem", color: "#78350f" }}>
        {doublons.map((x) => (
          <li key={`${x.type}-${x._id}`}>
            {x.type === "compte" ? "Compte partenaire" : "Fiche CRM"} : <strong>{x.libelle}</strong> — {x.motifs.map((m) => MOTIF[m] || m).join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function envoyer(url, headers, method, body) {
  const r = await fetch(url, { method, headers, body: JSON.stringify(body) });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(c.message || "Erreur.");
  return c;
}

export function JournalEchanges({ crm, headers, onEnregistre, notifier }) {
  const [f, setF] = useState({ canal: "phone", resume: "", date: "", prochaineAction: crm.prochaineAction || "", nextFollowUpDate: "" });
  const [envoi, setEnvoi] = useState(false);
  const echanges = [...(crm.echanges || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const ajouter = async () => {
    if (!f.resume.trim()) { notifier("Résumez l'échange.", "error"); return; }
    setEnvoi(true);
    try {
      const corps = { canal: f.canal, resume: f.resume, prochaineAction: f.prochaineAction };
      if (f.date) corps.date = f.date;
      if (f.nextFollowUpDate) corps.nextFollowUpDate = f.nextFollowUpDate;
      await envoyer(`/api/partner-crm/admin/${crm._id}/echanges`, headers, "POST", corps);
      notifier("Échange enregistré", "success");
      setF((x) => ({ ...x, resume: "", date: "", nextFollowUpDate: "" }));
      onEnregistre();
    } catch (e) { notifier(e.message, "error"); }
    setEnvoi(false);
  };
  return (
    <div style={boite}>
      <p style={titre}>Journal des échanges</p>
      {echanges.length === 0 ? <p style={{ margin: "0 0 8px", fontSize: ".76rem", color: "#94a3b8" }}>Aucun échange enregistré.</p> : (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, maxHeight: 180, overflowY: "auto" }}>
          {echanges.map((e, i) => (
            <li key={e._id || i} style={{ fontSize: ".76rem", padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
              <strong>{fmtJour(e.date)}</strong> · {CANAUX[e.canal] || e.canal}{e.par ? ` · ${e.par.firstName || ""} ${e.par.lastName || ""}` : ""}
              <div style={{ color: "#334155", whiteSpace: "pre-wrap" }}>{e.resume}</div>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        <label style={{ fontSize: ".72rem", color: "#64748b" }}>Canal
          <select aria-label="Canal de l'échange" value={f.canal} onChange={(e) => setF((x) => ({ ...x, canal: e.target.value }))} style={champ}>
            {Object.entries(CANAUX).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: ".72rem", color: "#64748b" }}>Date (aujourd'hui par défaut)
          <input type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} style={champ} />
        </label>
        <label style={{ fontSize: ".72rem", color: "#64748b" }}>Prochaine action
          <input value={f.prochaineAction} onChange={(e) => setF((x) => ({ ...x, prochaineAction: e.target.value }))} placeholder="Envoyer la grille…" style={champ} />
        </label>
        <label style={{ fontSize: ".72rem", color: "#64748b" }}>Échéance
          <input type="date" value={f.nextFollowUpDate} onChange={(e) => setF((x) => ({ ...x, nextFollowUpDate: e.target.value }))} style={champ} />
        </label>
      </div>
      <textarea aria-label="Résumé de l'échange" rows={2} value={f.resume} onChange={(e) => setF((x) => ({ ...x, resume: e.target.value }))}
        placeholder="Ce qui a été dit, décidé ou promis" style={{ ...champ, marginTop: 8, resize: "vertical" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button disabled={envoi} onClick={ajouter} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#0f1b3f", color: "#fff", fontWeight: 700, fontSize: ".76rem", cursor: envoi ? "not-allowed" : "pointer" }}>
          + Enregistrer l'échange
        </button>
      </div>
    </div>
  );
}

export function Abandon({ crm, headers, onFait, notifier }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  if (crm.statut === "ABANDONNE") {
    return <p style={{ fontSize: ".76rem", color: "#b91c1c", margin: "0 0 12px" }}>Abandonné — motif : {crm.motifAbandon || "non précisé"}</p>;
  }
  const valider = async () => {
    try {
      await envoyer(`/api/partner-crm/admin/${crm._id}/statut`, headers, "PATCH", { statut: "ABANDONNE", motif });
      notifier("Prospect marqué abandonné", "success");
      setOuvert(false); setMotif("");
      onFait();
    } catch (e) { notifier(e.message, "error"); }
  };
  return ouvert ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input aria-label="Motif de l'abandon" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire)" style={{ ...champ, flex: 1 }} />
      <button onClick={valider} disabled={!motif.trim()} style={{ padding: "6px 12px", border: "none", borderRadius: 8, background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: ".76rem" }}>Confirmer</button>
      <button onClick={() => setOuvert(false)} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", fontSize: ".76rem" }}>Annuler</button>
    </div>
  ) : (
    <button onClick={() => setOuvert(true)} style={{ marginBottom: 12, padding: "5px 12px", border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", fontWeight: 700, fontSize: ".74rem", cursor: "pointer" }}>
      Marquer abandonné…
    </button>
  );
}
