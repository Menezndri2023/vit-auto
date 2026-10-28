import { useState } from "react";
import {
  DONNEURS_ORDRE, PAYEURS, libelleDe, indicationTransportPrincipal, POSTES_COUT,
  TYPES_DOCUMENT, DOCUMENTS_PAR_ROLE,
} from "../constants/logistique";
import styles from "./Logistique.module.css";

// Blocs partagés des espaces logistiques client, prestataire et exportateur
// (2026-10-28). Aucun ne calcule ni n'affiche de rémunération VIT AUTO.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtMontant = (n, devise) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise || ""}`.trim());

const lireFichier = (fichier) => new Promise((ok, ko) => {
  const lecteur = new FileReader();
  lecteur.onload = () => ok(lecteur.result);
  lecteur.onerror = () => ko(new Error("Lecture du fichier impossible."));
  lecteur.readAsDataURL(fichier);
});

// Conditions Incoterms® de la commande (copie informative) + rôles déclarés.
export function BlocConditionsRoles({ demande, peutModifier = false, onEnregistrer }) {
  const [edition, setEdition] = useState(false);
  const [f, setF] = useState({ donneurOrdre: demande.donneurOrdre || "a_confirmer", payeur: demande.payeur || "a_confirmer", precisionRoles: demande.precisionRoles || "" });
  const indication = indicationTransportPrincipal(demande.incotermCommande?.regle);
  return (
    <div className={styles.bloc}>
      <h2>Conditions et rôles</h2>
      <dl className={styles.infos}>
        <dt>Incoterm de la commande</dt>
        <dd>{demande.incotermCommande?.libelle
          ? <>{demande.incotermCommande.libelle}{demande.incotermCommande.statut === "accepte" ? " — accepté par les parties" : " — proposé, non encore accepté"}</>
          : "Non renseigné"}</dd>
        <dt>Commande le transport</dt><dd>{libelleDe(DONNEURS_ORDRE, demande.donneurOrdre)}</dd>
        <dt>Paie le transport</dt><dd>{libelleDe(PAYEURS, demande.payeur)}</dd>
        {demande.precisionRoles && <><dt>Précisions</dt><dd>{demande.precisionRoles}</dd></>}
      </dl>
      {indication && <p className={styles.maj}>{indication} À titre indicatif seulement : seules les parties décident qui commande et qui paie.</p>}
      {peutModifier && !edition && <div className={styles.actions}><button type="button" className={styles.boutonSec} onClick={() => setEdition(true)}>Préciser les rôles</button></div>}
      {peutModifier && edition && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await onEnregistrer(f)) setEdition(false); }}>
          <div className={styles.formGrille} style={{ marginTop: 10 }}>
            <div className={styles.champ}>
              <label htmlFor="role-ordre">Qui commande le transport ?</label>
              <select id="role-ordre" value={f.donneurOrdre} onChange={(e) => setF((p) => ({ ...p, donneurOrdre: e.target.value }))}>
                {DONNEURS_ORDRE.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
              </select>
            </div>
            <div className={styles.champ}>
              <label htmlFor="role-payeur">Qui paie le transport ?</label>
              <select id="role-payeur" value={f.payeur} onChange={(e) => setF((p) => ({ ...p, payeur: e.target.value }))}>
                {PAYEURS.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
              </select>
            </div>
            <div className={`${styles.champ} ${styles.pleine}`}>
              <label htmlFor="role-precision">Précisions (facultatif)</label>
              <input id="role-precision" value={f.precisionRoles} onChange={(e) => setF((p) => ({ ...p, precisionRoles: e.target.value }))} />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.bouton}>Enregistrer</button>
            <button type="button" className={styles.boutonSec} onClick={() => setEdition(false)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BlocEnlevement({ enlevement }) {
  if (!enlevement?.confirmeLe) {
    return <div className={styles.bloc}><h2>Enlèvement</h2><p className={styles.maj}>Pas encore confirmé par l'exportateur.</p></div>;
  }
  const e = enlevement;
  return (
    <div className={styles.bloc}>
      <h2>Enlèvement — confirmé le {fmtDate(e.confirmeLe)}</h2>
      <dl className={styles.infos}>
        <dt>Marchandise</dt><dd>{e.disponible ? "Disponible" : "Pas encore disponible"}{e.dateDisponibilite ? ` — à partir du ${fmtDate(e.dateDisponibilite)}` : ""}</dd>
        <dt>Lieu</dt><dd>{e.lieu}</dd>
        {e.poidsKg != null && <><dt>Poids</dt><dd>{e.poidsKg} kg</dd></>}
        {e.volumeM3 != null && <><dt>Volume</dt><dd>{e.volumeM3} m³</dd></>}
        {e.chargement && <><dt>Chargement</dt><dd>{e.chargement}</dd></>}
        {e.contraintesManutention && <><dt>Manutention</dt><dd>{e.contraintesManutention}</dd></>}
        {e.documentsPrevus && <><dt>Documents prévus</dt><dd>{e.documentsPrevus}</dd></>}
      </dl>
    </div>
  );
}

// Liste des documents + dépôt des types autorisés pour le rôle.
export function BlocDocuments({ documents = [], role, onDeposer }) {
  const autorises = role ? DOCUMENTS_PAR_ROLE[role] || [] : [];
  const [type, setType] = useState(autorises[0] || "");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const envoyer = async (fichier) => {
    if (!fichier || !type) return;
    setOccupe(true); setErreur("");
    try { await onDeposer({ type, fichier: await lireFichier(fichier), nom: fichier.name }); }
    catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  return (
    <div className={styles.bloc}>
      <h2>Documents</h2>
      {documents.length === 0 ? <p className={styles.maj}>Aucun document. Aucun n'est obligatoire : ils dépendent de l'opération.</p> : (
        <ul className={styles.journal}>
          {documents.map((d) => (
            <li key={d._id}>
              <a href={d.url} target="_blank" rel="noreferrer">{TYPES_DOCUMENT[d.type] || d.type}{d.nom ? ` — ${d.nom}` : ""}</a> · déposé par {d.role} le {fmtDate(d.deposeLe)} · non vérifié par VIT AUTO
            </li>
          ))}
        </ul>
      )}
      {onDeposer && autorises.length > 0 && (
        <div className={styles.formGrille} style={{ marginTop: 10 }}>
          <div className={styles.champ}>
            <label htmlFor={`doc-type-${role}`}>Type de document</label>
            <select id={`doc-type-${role}`} value={type} onChange={(e) => setType(e.target.value)}>
              {autorises.map((t) => <option key={t} value={t}>{TYPES_DOCUMENT[t]}</option>)}
            </select>
          </div>
          <div className={styles.champ}>
            <label htmlFor={`doc-fichier-${role}`}>Fichier (image ou PDF, 8 Mo max.)</label>
            <input id={`doc-fichier-${role}`} type="file" accept="image/*,application/pdf" disabled={occupe} onChange={(e) => envoyer(e.target.files?.[0])} />
          </div>
        </div>
      )}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
    </div>
  );
}

// Détail des postes d'un devis (lecture).
export function PostesDevis({ devis }) {
  if (!devis?.postes?.length) return null;
  return (
    <ul className={styles.journal} aria-label="Détail des coûts">
      {devis.postes.map((p) => (
        <li key={p.categorie}>
          {libelleDe(POSTES_COUT, p.categorie)} : {p.montant != null ? fmtMontant(p.montant, devis.devise) : "montant non précisé"}
          {p.inclus ? " — inclus" : " — non inclus, frais possible en sus"}{p.note ? ` (${p.note})` : ""}
        </li>
      ))}
    </ul>
  );
}

// Saisie des postes (prestataire). `valeur` : [{ categorie, montant, inclus, note }]
export function EditeurPostes({ valeur, onChange }) {
  const maj = (i, k, v) => onChange(valeur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const restants = POSTES_COUT.filter((p) => !valeur.some((x) => x.categorie === p.code));
  return (
    <div className={`${styles.champ} ${styles.pleine}`}>
      <span className={styles.legende}>Détail des coûts (facultatif)</span>
      <span className={styles.aideChamp}>Si vous chiffrez les postes inclus, leur somme doit égaler le montant du devis. Un poste « non inclus » signale un frais possible en sus, sans l'ajouter au total.</span>
      {valeur.map((p, i) => (
        <div key={p.categorie} className={styles.formGrille}>
          <div className={styles.champ}><label htmlFor={`poste-m-${p.categorie}`}>{libelleDe(POSTES_COUT, p.categorie)}</label>
            <input id={`poste-m-${p.categorie}`} type="number" inputMode="decimal" min="0" step="0.01" value={p.montant ?? ""} onChange={(e) => maj(i, "montant", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className={styles.champ}><label htmlFor={`poste-i-${p.categorie}`}>Inclus dans le montant ?</label>
            <select id={`poste-i-${p.categorie}`} value={p.inclus ? "oui" : "non"} onChange={(e) => maj(i, "inclus", e.target.value === "oui")}>
              <option value="oui">Oui</option><option value="non">Non — frais possible en sus</option>
            </select></div>
          <div className={styles.champ}><label htmlFor={`poste-n-${p.categorie}`}>Note</label>
            <input id={`poste-n-${p.categorie}`} value={p.note || ""} onChange={(e) => maj(i, "note", e.target.value)} /></div>
          <div className={styles.champ} style={{ justifyContent: "flex-end" }}>
            <button type="button" className={styles.boutonSec} onClick={() => onChange(valeur.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        </div>
      ))}
      {restants.length > 0 && (
        <select aria-label="Ajouter un poste" value="" onChange={(e) => e.target.value && onChange([...valeur, { categorie: e.target.value, montant: null, inclus: true, note: "" }])}>
          <option value="">+ Ajouter un poste…</option>
          {restants.map((p) => <option key={p.code} value={p.code}>{p.libelle}</option>)}
        </select>
      )}
    </div>
  );
}
