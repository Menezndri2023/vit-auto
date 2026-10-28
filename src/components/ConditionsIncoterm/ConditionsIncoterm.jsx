import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { INCOTERMS, INCOTERM_STAGES, getIncoterm } from "../../constants/incoterms";
import styles from "./ConditionsIncoterm.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// Conditions Incoterms® 2020 d'une commande Trade ou Parts (2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Le serveur fait foi (routes /api/incoterms) : rôles, lieu nommé
// obligatoire, accord des deux parties, motif exigé après accord. L'assistant
// propose des règles, il ne choisit jamais à la place des parties.

const MODES = [["maritime", "Maritime"], ["routier", "Routier"], ["aerien", "Aérien"], ["ferroviaire", "Ferroviaire"], ["multimodal", "Multimodal"]];
const LIBELLES_STATUT_PROPOSITION = { recommande: "Recommandé", alternative: "Alternative", a_examiner: "À examiner" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

function Assistant({ onChoisir }) {
  const { token } = useAuth();
  const [s, setS] = useState({ modeTransport: "maritime", conteneurise: false, organisateurTransport: "acheteur", formalitesExport: "vendeur", formalitesImport: "acheteur", assuranceParVendeur: false, vendeurLivreADestination: false, vendeurDecharge: false });
  const [r, setR] = useState(null);
  const maj = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const lancer = async () => {
    const rep = await fetch("/api/incoterms/recommandation", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(s) });
    setR(await rep.json().catch(() => null));
  };
  const choix = (k, label, options) => (
    <div className={styles.champ}>
      <label htmlFor={`ia-${k}`}>{label}</label>
      <select id={`ia-${k}`} value={String(s[k])} onChange={(e) => maj(k, e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value)}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </div>
  );
  return (
    <div className={styles.bloc} style={{ background: "#f8fafc" }}>
      <h4 className={styles.titre}>🧭 Aide au choix de l'Incoterm</h4>
      <div className={styles.grille}>
        {choix("modeTransport", "Mode de transport", MODES)}
        {s.modeTransport === "maritime" && choix("conteneurise", "Conteneur remis au terminal ?", [[false, "Non — chargé à bord"], [true, "Oui — conteneur"]])}
        {choix("organisateurTransport", "Qui organise le transport principal ?", [["acheteur", "L'acheteur"], ["vendeur", "Le vendeur"]])}
        {choix("formalitesExport", "Formalités d'exportation", [["vendeur", "Le vendeur"], ["acheteur", "L'acheteur"]])}
        {s.organisateurTransport === "vendeur" && choix("vendeurLivreADestination", "Le vendeur prend le risque jusqu'à destination ?", [[false, "Non — au départ"], [true, "Oui — jusqu'à destination"]])}
        {s.organisateurTransport === "vendeur" && !s.vendeurLivreADestination && choix("assuranceParVendeur", "Assurance transport souscrite par le vendeur ?", [[false, "Non"], [true, "Oui"]])}
        {s.organisateurTransport === "vendeur" && s.vendeurLivreADestination && choix("formalitesImport", "Formalités d'importation", [["acheteur", "L'acheteur"], ["vendeur", "Le vendeur"]])}
        {s.organisateurTransport === "vendeur" && s.vendeurLivreADestination && s.formalitesImport !== "vendeur" && choix("vendeurDecharge", "Le vendeur décharge à destination ?", [[false, "Non"], [true, "Oui"]])}
      </div>
      <div className={styles.actions}><button type="button" className={styles.boutonSec} onClick={lancer}>Voir les règles adaptées</button></div>
      {r && (
        <>
          {r.propositions?.map((p) => (
            <div key={p.code} className={`${styles.proposition} ${p.statut === "recommande" ? styles.recommande : ""}`}>
              <strong>{p.libelle}</strong> — <span className={styles.muted}>{LIBELLES_STATUT_PROPOSITION[p.statut]}</span>
              <p className={styles.muted}>{p.raison}</p>
              <button type="button" className={styles.boutonSec} onClick={() => onChoisir(p.code, s.modeTransport)}>Utiliser {p.code}</button>
            </div>
          ))}
          {r.avertissements?.map((a) => <p key={a} className={styles.alerte}>⚠️ {a}</p>)}
          <p className={styles.muted}>{r.avertissementAide}</p>
        </>
      )}
    </div>
  );
}

export default function ConditionsIncoterm({ type, id }) {
  const { token } = useAuth();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState("");
  const [edition, setEdition] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [form, setForm] = useState({ regle: "", lieuNomme: "", pays: "", modeTransport: "", notes: "", referenceDevis: "", motif: "" });
  const [occupe, setOccupe] = useState(false);
  const base = `/api/incoterms/commandes/${type}/${id}`;

  const api = useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.message || "Erreur.");
    return c;
  }, [token]);

  const charger = useCallback(() => { api(base).then(setEtat).catch((e) => setErreur(e.message)); }, [api, base]);
  useEffect(() => { if (id) charger(); }, [charger, id]);

  if (erreur && !etat) return null;   // commande inaccessible : rien à montrer
  if (!etat) return null;
  const c = etat.conditions;
  const ouvrirEdition = () => {
    setForm({ regle: c?.regle || etat.suggestion?.regle || "", lieuNomme: c?.lieuNomme || "", pays: c?.pays || "", modeTransport: c?.modeTransport || "", notes: c?.notes || "", referenceDevis: c?.referenceDevis || "", motif: "" });
    setEdition(true);
  };
  const envoyer = async (e) => {
    e.preventDefault();
    setOccupe(true); setErreur("");
    try { setEtat(await api(base, { method: "PUT", body: JSON.stringify(form) })); setEdition(false); setAssistant(false); }
    catch (err) { setErreur(err.message); } finally { setOccupe(false); }
  };
  const valider = async () => {
    setOccupe(true); setErreur("");
    try { setEtat(await api(`${base}/valider`, { method: "POST" })); } catch (err) { setErreur(err.message); } finally { setOccupe(false); }
  };
  const regleInfo = getIncoterm(c?.regle);
  const autre = etat.role === "acheteur" ? "vendeur" : "acheteur";

  return (
    <section className={styles.bloc} aria-labelledby={`incoterm-${id}`}>
      <h3 id={`incoterm-${id}`} className={styles.titre}>📦 Conditions Incoterms® 2020</h3>
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
      {c?.regle ? (
        <>
          <p className={styles.libelle}>{c.libelle}</p>
          <span className={`${styles.statut} ${c.statut === "accepte" ? styles.statutOk : ""}`}>
            {c.statut === "accepte" ? `Accepté par les deux parties le ${fmtDate(c.valideLe)}` : "Proposé — en attente de validation"}
          </span>
          <p className={styles.muted}>Acheteur : {c.valideAcheteur?.le ? `validé le ${fmtDate(c.valideAcheteur.le)}` : "à valider"} · Vendeur : {c.valideVendeur?.le ? `validé le ${fmtDate(c.valideVendeur.le)}` : "à valider"}</p>
          {regleInfo && (
            <>
              <p className={styles.muted}>{regleInfo.summary}</p>
              <div className={styles.etapes}>
                {INCOTERM_STAGES.map(([k, l]) => <div key={k} className={styles.etape}>{l} : <strong>{regleInfo.responsibilities[k]}</strong></div>)}
              </div>
            </>
          )}
          {c.avertissements?.map((a) => <p key={a} className={styles.alerte}>⚠️ {a}</p>)}
          {c.notes && <p className={styles.muted}>Notes : {c.notes}</p>}
          <p className={styles.muted}>Ces responsabilités décrivent la règle ; elles ne désignent pas d'office qui commande ni qui paie le transport, que les parties précisent par ailleurs.</p>
        </>
      ) : (
        <p className={styles.muted}>
          Aucune condition convenue.{etat.suggestion?.regle ? ` L'annonce indique ${etat.suggestion.regle} : précisez le lieu nommé et faites valider par le ${autre}.` : ""}
        </p>
      )}

      {(etat.peutModifier || etat.peutValider) && !edition && (
        <div className={styles.actions}>
          {etat.peutValider && <button type="button" className={styles.bouton} disabled={occupe} onClick={valider}>Valider ces conditions</button>}
          {etat.peutModifier && <button type="button" className={styles.boutonSec} disabled={occupe} onClick={ouvrirEdition}>{c?.regle ? "Modifier" : "Proposer des conditions"}</button>}
        </div>
      )}

      {edition && (
        <form onSubmit={envoyer}>
          <div className={styles.grille}>
            <div className={styles.champ}>
              <label htmlFor={`inc-regle-${id}`}>Règle</label>
              <select id={`inc-regle-${id}`} required value={form.regle} onChange={(e) => setForm((f) => ({ ...f, regle: e.target.value }))}>
                <option value="">Choisir…</option>
                {INCOTERMS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
              </select>
            </div>
            <div className={styles.champ}>
              <label htmlFor={`inc-lieu-${id}`}>Lieu ou port convenu</label>
              <input id={`inc-lieu-${id}`} required minLength={2} placeholder="Ex. : Port de Tanger Med" value={form.lieuNomme} onChange={(e) => setForm((f) => ({ ...f, lieuNomme: e.target.value }))} />
            </div>
            <div className={styles.champ}>
              <label htmlFor={`inc-pays-${id}`}>Pays (code, facultatif)</label>
              <input id={`inc-pays-${id}`} maxLength={2} placeholder="MA" value={form.pays} onChange={(e) => setForm((f) => ({ ...f, pays: e.target.value.toUpperCase() }))} />
            </div>
            <div className={styles.champ}>
              <label htmlFor={`inc-mode-${id}`}>Mode de transport</label>
              <select id={`inc-mode-${id}`} value={form.modeTransport} onChange={(e) => setForm((f) => ({ ...f, modeTransport: e.target.value }))}>
                <option value="">Non précisé</option>
                {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className={`${styles.champ} ${styles.pleine}`}>
              <label htmlFor={`inc-notes-${id}`}>Notes convenues (facultatif)</label>
              <textarea id={`inc-notes-${id}`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {c?.statut === "accepte" && (
              <div className={`${styles.champ} ${styles.pleine}`}>
                <label htmlFor={`inc-motif-${id}`}>Motif de la modification (obligatoire après accord)</label>
                <input id={`inc-motif-${id}`} required value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} />
              </div>
            )}
          </div>
          <p className={styles.muted}>Votre proposition vaut validation de votre part ; le {autre} devra la valider à son tour.</p>
          <div className={styles.actions}>
            <button type="submit" className={styles.bouton} disabled={occupe}>Enregistrer la proposition</button>
            <button type="button" className={styles.boutonSec} onClick={() => setAssistant((a) => !a)}>{assistant ? "Masquer l'aide au choix" : "Aide au choix"}</button>
            <button type="button" className={styles.boutonSec} onClick={() => { setEdition(false); setAssistant(false); }}>Annuler</button>
          </div>
          {assistant && <Assistant onChoisir={(code, mode) => setForm((f) => ({ ...f, regle: code, modeTransport: mode }))} />}
        </form>
      )}

      {c?.historique?.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className={styles.muted} style={{ cursor: "pointer", minHeight: 32 }}>Historique ({c.historique.length})</summary>
          <ul className={styles.historique}>
            {[...c.historique].reverse().map((h, i) => (
              <li key={i}>{fmtDate(h.le)} — {h.role} — {h.action} : {h.regle} {h.lieuNomme}{h.motif ? ` (motif : ${h.motif})` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
