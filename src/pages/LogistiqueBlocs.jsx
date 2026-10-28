import { useState } from "react";
import { DONNEURS_ORDRE, PAYEURS, POSTES_COUT, DOCUMENTS_PAR_ROLE } from "../constants/logistique";
import { useLog } from "./logistiqueI18n";
import styles from "./Logistique.module.css";

// Blocs partagés des espaces logistiques client, prestataire et exportateur
// (2026-10-28), traduits (src/i18n/logistique.js). Aucun ne calcule ni
// n'affiche de rémunération VIT AUTO.

const lireFichier = (fichier, messageErreur) => new Promise((ok, ko) => {
  const lecteur = new FileReader();
  lecteur.onload = () => ok(lecteur.result);
  lecteur.onerror = () => ko(new Error(messageErreur));
  lecteur.readAsDataURL(fichier);
});

const REGLES_ACHETEUR = ["EXW", "FCA", "FAS", "FOB"];

// Conditions Incoterms® de la commande (copie informative) + rôles déclarés.
export function BlocConditionsRoles({ demande, peutModifier = false, onEnregistrer }) {
  const L = useLog();
  const { t } = L;
  const [edition, setEdition] = useState(false);
  const [f, setF] = useState({ donneurOrdre: demande.donneurOrdre || "a_confirmer", payeur: demande.payeur || "a_confirmer", precisionRoles: demande.precisionRoles || "" });
  const regle = demande.incotermCommande?.regle;
  return (
    <div className={styles.bloc}>
      <h2>{t("log.conditionsRoles")}</h2>
      <dl className={styles.infos}>
        <dt>{t("log.incotermCommande")}</dt>
        <dd>{demande.incotermCommande?.libelle
          ? <>{demande.incotermCommande.libelle}{t(demande.incotermCommande.statut === "accepte" ? "log.accepteParties" : "log.proposeSeulement")}</>
          : t("log.nonRenseigne")}</dd>
        <dt>{t("log.commandeTransport")}</dt><dd>{L.role(demande.donneurOrdre || "a_confirmer")}</dd>
        <dt>{t("log.paieTransport")}</dt><dd>{L.role(demande.payeur || "a_confirmer")}</dd>
        {demande.precisionRoles && <><dt>{t("log.precisions")}</dt><dd>{demande.precisionRoles}</dd></>}
      </dl>
      {regle && (
        <p className={styles.maj}>{t("log.indicationHabituelle", { regle, partie: t(REGLES_ACHETEUR.includes(regle) ? "log.lAcheteur" : "log.leVendeur") })}</p>
      )}
      {peutModifier && !edition && <div className={styles.actions}><button type="button" className={styles.boutonSec} onClick={() => setEdition(true)}>{t("log.preciserRoles")}</button></div>}
      {peutModifier && edition && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await onEnregistrer(f)) setEdition(false); }}>
          <div className={styles.formGrille} style={{ marginTop: 10 }}>
            <div className={styles.champ}>
              <label htmlFor="role-ordre">{t("log.quiCommande")}</label>
              <select id="role-ordre" value={f.donneurOrdre} onChange={(e) => setF((p) => ({ ...p, donneurOrdre: e.target.value }))}>
                {DONNEURS_ORDRE.map((x) => <option key={x.code} value={x.code}>{L.role(x.code)}</option>)}
              </select>
            </div>
            <div className={styles.champ}>
              <label htmlFor="role-payeur">{t("log.quiPaie")}</label>
              <select id="role-payeur" value={f.payeur} onChange={(e) => setF((p) => ({ ...p, payeur: e.target.value }))}>
                {PAYEURS.map((x) => <option key={x.code} value={x.code}>{L.role(x.code)}</option>)}
              </select>
            </div>
            <div className={`${styles.champ} ${styles.pleine}`}>
              <label htmlFor="role-precision">{t("log.precisionsFac")}</label>
              <input id="role-precision" value={f.precisionRoles} onChange={(e) => setF((p) => ({ ...p, precisionRoles: e.target.value }))} />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.bouton}>{t("log.enregistrer")}</button>
            <button type="button" className={styles.boutonSec} onClick={() => setEdition(false)}>{t("log.annuler")}</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BlocEnlevement({ enlevement }) {
  const L = useLog();
  const { t } = L;
  if (!enlevement?.confirmeLe) {
    return <div className={styles.bloc}><h2>{t("log.enlevement")}</h2><p className={styles.maj}>{t("log.enlevementNonConfirme")}</p></div>;
  }
  const e = enlevement;
  return (
    <div className={styles.bloc}>
      <h2>{t("log.enlevementConfirme", { date: L.fmtDate(e.confirmeLe) })}</h2>
      <dl className={styles.infos}>
        <dt>{t("log.marchandise")}</dt><dd>{t(e.disponible ? "log.disponible" : "log.pasDisponible")}{e.dateDisponibilite ? t("log.aPartirDu", { date: L.fmtDate(e.dateDisponibilite) }) : ""}</dd>
        <dt>{t("log.lieu")}</dt><dd>{e.lieu}</dd>
        {e.poidsKg != null && <><dt>{t("log.poids")}</dt><dd>{e.poidsKg} kg</dd></>}
        {e.volumeM3 != null && <><dt>{t("log.volume")}</dt><dd>{e.volumeM3} m³</dd></>}
        {e.chargement && <><dt>{t("log.chargementLib")}</dt><dd>{e.chargement}</dd></>}
        {e.contraintesManutention && <><dt>{t("log.manutention")}</dt><dd>{e.contraintesManutention}</dd></>}
        {e.documentsPrevus && <><dt>{t("log.documentsPrevus")}</dt><dd>{e.documentsPrevus}</dd></>}
      </dl>
    </div>
  );
}

// Liste des documents + dépôt des types autorisés pour le rôle.
export function BlocDocuments({ documents = [], role, onDeposer }) {
  const L = useLog();
  const { t } = L;
  const autorises = role ? DOCUMENTS_PAR_ROLE[role] || [] : [];
  const [type, setType] = useState(autorises[0] || "");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const envoyer = async (fichier) => {
    if (!fichier || !type) return;
    setOccupe(true); setErreur("");
    try { await onDeposer({ type, fichier: await lireFichier(fichier, t("log.lectureImpossible")), nom: fichier.name }); }
    catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  return (
    <div className={styles.bloc}>
      <h2>{t("log.documents")}</h2>
      {documents.length === 0 ? <p className={styles.maj}>{t("log.aucunDocument")}</p> : (
        <ul className={styles.journal}>
          {documents.map((d) => (
            <li key={d._id}>
              <a href={d.url} target="_blank" rel="noreferrer">{L.doc(d.type)}{d.nom ? ` — ${d.nom}` : ""}</a>{t("log.deposePar", { role: L.partie(d.role), date: L.fmtDate(d.deposeLe) })}
            </li>
          ))}
        </ul>
      )}
      {onDeposer && autorises.length > 0 && (
        <div className={styles.formGrille} style={{ marginTop: 10 }}>
          <div className={styles.champ}>
            <label htmlFor={`doc-type-${role}`}>{t("log.typeDocument")}</label>
            <select id={`doc-type-${role}`} value={type} onChange={(e) => setType(e.target.value)}>
              {autorises.map((x) => <option key={x} value={x}>{L.doc(x)}</option>)}
            </select>
          </div>
          <div className={styles.champ}>
            <label htmlFor={`doc-fichier-${role}`}>{t("log.fichierDoc")}</label>
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
  const L = useLog();
  const { t } = L;
  if (!devis?.postes?.length) return null;
  return (
    <ul className={styles.journal} aria-label={t("log.detailCouts")}>
      {devis.postes.map((p) => (
        <li key={p.categorie}>
          {L.poste(p.categorie)} : {p.montant != null ? L.fmtMontant(p.montant, devis.devise) : t("log.montantNonPrecise")}
          {t(p.inclus ? "log.posteInclus" : "log.posteNonInclus")}{p.note ? ` (${p.note})` : ""}
        </li>
      ))}
    </ul>
  );
}

// Saisie des postes (prestataire). `valeur` : [{ categorie, montant, inclus, note }]
export function EditeurPostes({ valeur, onChange }) {
  const L = useLog();
  const { t } = L;
  const maj = (i, k, v) => onChange(valeur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const restants = POSTES_COUT.filter((p) => !valeur.some((x) => x.categorie === p.code));
  return (
    <div className={`${styles.champ} ${styles.pleine}`}>
      <span className={styles.legende}>{t("log.detailCoutsFac")}</span>
      <span className={styles.aideChamp}>{t("log.detailCoutsAide")}</span>
      {valeur.map((p, i) => (
        <div key={p.categorie} className={styles.formGrille}>
          <div className={styles.champ}><label htmlFor={`poste-m-${p.categorie}`}>{L.poste(p.categorie)}</label>
            <input id={`poste-m-${p.categorie}`} type="number" inputMode="decimal" min="0" step="0.01" value={p.montant ?? ""} onChange={(e) => maj(i, "montant", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className={styles.champ}><label htmlFor={`poste-i-${p.categorie}`}>{t("log.inclusDansMontant")}</label>
            <select id={`poste-i-${p.categorie}`} value={p.inclus ? "oui" : "non"} onChange={(e) => maj(i, "inclus", e.target.value === "oui")}>
              <option value="oui">{t("log.oui")}</option><option value="non">{t("log.nonFraisSus")}</option>
            </select></div>
          <div className={styles.champ}><label htmlFor={`poste-n-${p.categorie}`}>{t("log.note")}</label>
            <input id={`poste-n-${p.categorie}`} value={p.note || ""} onChange={(e) => maj(i, "note", e.target.value)} /></div>
          <div className={styles.champ} style={{ justifyContent: "flex-end" }}>
            <button type="button" className={styles.boutonSec} onClick={() => onChange(valeur.filter((_, j) => j !== i))}>{t("log.retirer")}</button>
          </div>
        </div>
      ))}
      {restants.length > 0 && (
        <select aria-label={t("log.ajouterPosteAria")} value="" onChange={(e) => e.target.value && onChange([...valeur, { categorie: e.target.value, montant: null, inclus: true, note: "" }])}>
          <option value="">{t("log.ajouterPoste")}</option>
          {restants.map((p) => <option key={p.code} value={p.code}>{L.poste(p.code)}</option>)}
        </select>
      )}
    </div>
  );
}
