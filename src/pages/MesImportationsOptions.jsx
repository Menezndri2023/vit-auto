import { useState } from "react";
import {
  FORMULES_INSPECTION, inspectionIncluse, RUBRIQUES_INSPECTION, ETATS_RUBRIQUE, VERDICTS, STATUTS_INSPECTION,
  GARANTIES_ASSURANCE, primeIndicative, STATUTS_ASSURANCE, DUREES_FINANCEMENT, SITUATIONS_PRO, STATUTS_FINANCEMENT,
} from "../constants/dossierImport";
import styles from "./MesImportations.module.css";

// Étape 3 de l'Import/Export (2026-10-09) : depuis son dossier, le client
// demande l'inspection indépendante, l'assurance du transport et un
// financement ; VIT AUTO instruit et répond dans le même dossier.

const fmt = (n, devise = "USD") => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const champ = { display: "block", width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 16, boxSizing: "border-box" };

export default function OptionsDossierClient({ dossier, api, onDossier }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [formule, setFormule] = useState("premium");
  const [assurance, setAssurance] = useState({ garantie: "tous_risques", valeur: dossier.budget?.montant || "" });
  const [fin, setFin] = useState({ montantDemande: "", apport: "", dureeMois: 36, situationPro: "salarie", revenusMensuels: "" });
  const ouvert = dossier.statut === "en_cours";
  const insp = dossier.inspection || {};
  const ass = dossier.assurance || {};
  const f = dossier.financement || {};
  const devise = dossier.devis?.devise || "USD";

  const envoyer = async (chemin, corps) => {
    setOccupe(true); setErreur("");
    try { const c = await api(`/api/dossiers-import/${dossier._id}/${chemin}`, { method: "POST", body: JSON.stringify(corps || {}) }); onDossier(c.dossier); }
    catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };

  return (
    <>
      {erreur && <p className={styles.erreur}>{erreur}</p>}

      <section className={styles.bloc}>
        <h2>🛠️ Inspection avant départ</h2>
        <p className={styles.aide}>Un inspecteur indépendant, mandaté par VIT AUTO et sans lien avec le vendeur, contrôle le véhicule avant tout paiement. S'il le juge non conforme, rien n'est payé ni embarqué.</p>
        <p><strong>{STATUTS_INSPECTION[insp.statut] || "Non demandée"}</strong>{insp.formule ? ` — ${FORMULES_INSPECTION[insp.formule]?.libelle}${insp.prix === 0 ? " (incluse dans votre pack)" : insp.prix ? ` (${fmt(insp.prix)})` : ""}` : ""}</p>
        {insp.statut === "realisee" && (
          <div className={styles.encart}>
            <p><strong style={{ color: VERDICTS[insp.verdict]?.couleur }}>{VERDICTS[insp.verdict]?.libelle}</strong> — inspecté le {fmtDate(insp.realiseeLe)}{insp.lieu ? ` à ${insp.lieu}` : ""}{insp.kilometrage != null ? `, ${insp.kilometrage.toLocaleString("fr-FR")} km` : ""}</p>
            <p>{insp.synthese}</p>
            <ul className={styles.notes}>
              {(insp.points || []).map((p) => <li key={p.rubrique}>{RUBRIQUES_INSPECTION.find((r) => r.code === p.rubrique)?.libelle} : <strong>{ETATS_RUBRIQUE[p.etat]}</strong>{p.note ? ` — ${p.note}` : ""}</li>)}
            </ul>
          </div>
        )}
        {ouvert && insp.statut === "non_demandee" && (
          <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); envoyer("inspection/demander", { formule }); }}>
            <select value={formule} onChange={(e) => setFormule(e.target.value)} aria-label="Formule d'inspection" style={champ}>
              {Object.entries(FORMULES_INSPECTION).map(([k, v]) => (
                <option key={k} value={k}>{v.libelle} — {inspectionIncluse(k, dossier.pack?.code) ? "incluse dans votre pack" : fmt(v.prix)}</option>
              ))}
            </select>
            <button type="submit" className={styles.bouton} disabled={occupe}>Demander l'inspection</button>
          </form>
        )}
      </section>

      <section className={styles.bloc}>
        <h2>🛡️ Assurance du transport</h2>
        <p className={styles.aide}>Couvre le véhicule pendant le trajet maritime, du port de départ jusqu'à l'arrivée.</p>
        <p><strong>{STATUTS_ASSURANCE[ass.statut] || "Non demandée"}</strong>{ass.garantie ? ` — ${GARANTIES_ASSURANCE[ass.garantie]?.libelle}` : ""}</p>
        {ass.prime != null && <p>Prime : <strong>{fmt(ass.prime, ass.devise)}</strong>{ass.assureur ? ` — ${ass.assureur}` : ""}</p>}
        {ass.numeroPolice && <p>Police n° <strong>{ass.numeroPolice}</strong></p>}
        {ass.note && ass.statut === "refusee" && <p className={styles.aide}>{ass.note}</p>}
        {ouvert && ["non_demandee", "refusee"].includes(ass.statut || "non_demandee") && (
          <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); envoyer("assurance/demander", assurance); }}>
            <select value={assurance.garantie} onChange={(e) => setAssurance({ ...assurance, garantie: e.target.value })} aria-label="Garantie" style={champ}>
              {Object.entries(GARANTIES_ASSURANCE).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}
            </select>
            <input type="number" inputMode="decimal" min="1" value={assurance.valeur} onChange={(e) => setAssurance({ ...assurance, valeur: e.target.value })} placeholder={`Valeur du véhicule (${devise})`} aria-label="Valeur du véhicule" required />
            {primeIndicative(assurance.valeur, assurance.garantie) && <p className={styles.aide}>Prime indicative : environ {fmt(primeIndicative(assurance.valeur, assurance.garantie), devise)} — le montant exact vient de l'assureur.</p>}
            <button type="submit" className={styles.bouton} disabled={occupe}>Demander l'assurance</button>
          </form>
        )}
        {ouvert && ass.statut === "proposee" && (
          <button type="button" className={styles.bouton} disabled={occupe} onClick={() => envoyer("assurance/accepter")}>Accepter la proposition ({fmt(ass.prime, ass.devise)})</button>
        )}
      </section>

      <section className={styles.bloc}>
        <h2>🏦 Financement</h2>
        <p className={styles.aide}>VIT AUTO étudie votre demande avec un organisme partenaire. Frais de dossier selon le montant (de 110 à 2 200 USD).</p>
        <p><strong>{STATUTS_FINANCEMENT[f.statut] || "Non demandé"}</strong></p>
        {f.statut === "accorde" && (
          <div className={styles.encart}>
            {fmt(f.montantAccorde, f.devise)} à {f.tauxAnnuel} % sur {f.dureeMois} mois : <strong>{fmt(f.mensualite, f.devise)} par mois</strong>
            {f.organisme ? ` — ${f.organisme}` : ""}{f.fraisDossier ? ` · frais de dossier ${fmt(f.fraisDossier, f.devise)}` : ""}
          </div>
        )}
        {f.note && <p className={styles.aide}>{f.note}</p>}
        {ouvert && ["non_demande", "refuse", "annule"].includes(f.statut || "non_demande") && (
          <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); envoyer("financement/demander", { ...fin, dureeMois: Number(fin.dureeMois) }); }}>
            <input type="number" inputMode="decimal" min="1" value={fin.montantDemande} onChange={(e) => setFin({ ...fin, montantDemande: e.target.value })} placeholder={`Montant à financer (${devise})`} aria-label="Montant à financer" required />
            <input type="number" inputMode="decimal" min="0" value={fin.apport} onChange={(e) => setFin({ ...fin, apport: e.target.value })} placeholder={`Apport personnel (${devise})`} aria-label="Apport personnel" />
            <select value={fin.dureeMois} onChange={(e) => setFin({ ...fin, dureeMois: e.target.value })} aria-label="Durée" style={champ}>
              {DUREES_FINANCEMENT.map((n) => <option key={n} value={n}>{n} mois</option>)}
            </select>
            <select value={fin.situationPro} onChange={(e) => setFin({ ...fin, situationPro: e.target.value })} aria-label="Situation professionnelle" style={champ}>
              {Object.entries(SITUATIONS_PRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" inputMode="decimal" min="1" value={fin.revenusMensuels} onChange={(e) => setFin({ ...fin, revenusMensuels: e.target.value })} placeholder={`Revenus mensuels nets (${devise})`} aria-label="Revenus mensuels nets" required />
            <button type="submit" className={styles.bouton} disabled={occupe}>Demander un financement</button>
          </form>
        )}
        {ouvert && ["demande", "en_etude", "accorde"].includes(f.statut) && (
          <button type="button" className={styles.lienBouton} disabled={occupe} onClick={() => { if (window.confirm("Retirer votre demande de financement ?")) envoyer("financement/annuler"); }}>Retirer ma demande</button>
        )}
      </section>
    </>
  );
}
