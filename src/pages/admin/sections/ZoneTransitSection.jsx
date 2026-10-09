import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "../shared.jsx";
import { DESTINATIONS, ORIGINES } from "../../../constants/dossierImport";
import css from "./DossiersImportSection.module.css";

// ── Zone Transit (2026-10-07) ──────────────────────────────────────────────
// Les prestataires logistiques (transitaires, commissionnaires en douane,
// inspecteurs, transporteurs) n'ont PAS d'inscription publique : l'admin leur
// envoie ici un lien personnel, valable 7 jours et utilisable une fois. Ils
// ne voient ensuite que les dossiers d'import qu'on leur affecte (onglet
// « Dossiers d'import »).

const TYPES = [
  { code: "transitaire", libelle: "Transitaire" },
  { code: "commissionnaire_douane", libelle: "Commissionnaire en douane" },
  { code: "inspecteur", libelle: "Inspecteur" },
  { code: "transporteur", libelle: "Transporteur" },
];
const PAYS = [...DESTINATIONS, ...ORIGINES];
const etatInvitation = (i) => (i.utiliseeLe ? "Utilisée" : i.revoqueeLe ? "Révoquée" : new Date(i.expireLe) < new Date() ? "Expirée" : "En attente");

export function ZoneTransitSection({ headers }) {
  const [prestataires, setPrestataires] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [form, setForm] = useState({ email: "", raisonSociale: "", types: ["transitaire"], pays: [] });
  const [lien, setLien] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  const appel = useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...headers } });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.message || "Erreur.");
    return c;
  }, [headers]);

  const charger = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([appel("/api/transit/admin/prestataires"), appel("/api/transit/admin/invitations")]);
      setPrestataires(p.prestataires || []);
      setInvitations(i.invitations || []);
    } catch (e) { setErreur(e.message); }
  }, [appel]);
  useEffect(() => { charger(); }, [charger]);

  const basculer = (cle, valeur) => setForm((f) => ({ ...f, [cle]: f[cle].includes(valeur) ? f[cle].filter((v) => v !== valeur) : [...f[cle], valeur] }));

  const inviter = async (e) => {
    e.preventDefault();
    setOccupe(true); setErreur(""); setLien("");
    try {
      const c = await appel("/api/transit/admin/invitations", { method: "POST", body: JSON.stringify(form) });
      setLien(`${window.location.origin}${c.lien}`);
      setForm({ email: "", raisonSociale: "", types: ["transitaire"], pays: [] });
      charger();
    } catch (err) { setErreur(err.message); } finally { setOccupe(false); }
  };

  const action = async (url, corps) => {
    setOccupe(true); setErreur("");
    try { await appel(url, { method: corps ? "PATCH" : "POST", ...(corps ? { body: JSON.stringify(corps) } : {}) }); charger(); }
    catch (err) { setErreur(err.message); } finally { setOccupe(false); }
  };

  return (
    <div className={css.section}>
      {erreur && <p className={css.erreur}>{erreur}</p>}

      <form onSubmit={inviter}><fieldset className={css.bloc}>
        <legend>Inviter un prestataire</legend>
        <p className={css.muted}>Un e-mail part avec un lien personnel (7 jours, une seule utilisation). L'inscription n'est pas accessible sans ce lien.</p>
        <div className={css.grille2}>
          <label>Adresse e-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Raison sociale<input value={form.raisonSociale} onChange={(e) => setForm({ ...form, raisonSociale: e.target.value })} required /></label>
        </div>
        <div className={css.actions}>
          {TYPES.map((t) => (
            <label key={t.code} className={css.case}><input type="checkbox" checked={form.types.includes(t.code)} onChange={() => basculer("types", t.code)} /> {t.libelle}</label>
          ))}
        </div>
        <div className={css.actions}>
          <span className={css.muted}>Pays couverts :</span>
          {PAYS.map((p) => (
            <label key={p.code} className={css.case}><input type="checkbox" checked={form.pays.includes(p.code)} onChange={() => basculer("pays", p.code)} /> {p.nom}</label>
          ))}
        </div>
        <div className={css.actions}>
          <button type="submit" className={css.btn} disabled={occupe || !form.types.length}>Envoyer l'invitation</button>
        </div>
        {lien && (
          <p className={css.muted}>Invitation envoyée. Lien à transmettre aussi par WhatsApp si l'e-mail tarde (affiché une seule fois) :{" "}
            <code style={{ wordBreak: "break-all" }}>{lien}</code>{" "}
            <button type="button" className={css.lien} onClick={() => navigator.clipboard?.writeText(lien)}>Copier</button>
          </p>
        )}
      </fieldset></form>

      <fieldset className={css.bloc}>
        <legend>Prestataires ({prestataires.length})</legend>
        {prestataires.length === 0 && <p className={css.muted}>Aucun prestataire inscrit pour l'instant.</p>}
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr><th>Société</th><th>Contact</th><th>Métiers</th><th>Pays</th><th>Dossiers en cours</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {prestataires.map((p) => (
                <tr key={p._id}>
                  <td>{p.raisonSociale}</td>
                  <td>{p.user?.firstName} {p.user?.lastName}<br /><span className={css.muted}>{p.user?.email}{p.telephone ? ` · ${p.telephone}` : ""}</span></td>
                  <td>{(p.types || []).map((t) => TYPES.find((x) => x.code === t)?.libelle || t).join(", ")}</td>
                  <td>{(p.pays || []).join(", ") || "—"}</td>
                  <td>{p.dossiersEnCours}</td>
                  <td>{p.statut === "actif" ? "Actif" : "Suspendu"}</td>
                  <td>
                    <button type="button" className={p.statut === "actif" ? css.btnDanger : css.btnSec} disabled={occupe}
                      onClick={() => action(`/api/transit/admin/prestataires/${p._id}`, { statut: p.statut === "actif" ? "suspendu" : "actif" })}>
                      {p.statut === "actif" ? "Suspendre" : "Réactiver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Invitations</legend>
        {invitations.length === 0 && <p className={css.muted}>Aucune invitation envoyée.</p>}
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr><th>Société</th><th>E-mail</th><th>Envoyée le</th><th>Expire le</th><th>État</th><th /></tr></thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i._id}>
                  <td>{i.raisonSociale}</td>
                  <td>{i.email}</td>
                  <td>{fmtDate(i.createdAt)}</td>
                  <td>{fmtDate(i.expireLe)}</td>
                  <td>{etatInvitation(i)}</td>
                  <td>{etatInvitation(i) === "En attente" && (
                    <button type="button" className={css.btnSec} disabled={occupe} onClick={() => action(`/api/transit/admin/invitations/${i._id}/revoquer`)}>Révoquer</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  );
}
