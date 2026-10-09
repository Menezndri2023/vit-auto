import { useState } from "react";
import { fmtDate } from "../shared.jsx";
import {
  FORMULES_INSPECTION, RUBRIQUES_INSPECTION, ETATS_RUBRIQUE, VERDICTS, STATUTS_INSPECTION,
  GARANTIES_ASSURANCE, primeIndicative, STATUTS_ASSURANCE, DUREES_FINANCEMENT, SITUATIONS_PRO, STATUTS_FINANCEMENT,
} from "../../../constants/dossierImport";
import css from "./DossiersImportSection.module.css";

// ── Étape 3 de l'Import/Export (2026-10-09) ────────────────────────────────
// Dans le détail d'un dossier : l'inspection indépendante (inspecteur de la
// zone Transit), l'assurance du transport et le financement. Le client
// demande depuis « Mes importations », l'admin instruit ici.

export function OptionsDossierAdmin({ d, id, appel, occupe, prestataires }) {
  const insp = d.inspection || {};
  const ass = d.assurance || {};
  const fin = d.financement || {};
  const [formule, setFormule] = useState(insp.formule || "standard");
  const [inspecteur, setInspecteur] = useState("");
  const [proposition, setProposition] = useState({ prime: "", assureur: "" });
  const [police, setPolice] = useState("");
  const [offre, setOffre] = useState({ montantAccorde: "", tauxAnnuel: "", dureeMois: "", fraisDossier: "", organisme: "", note: "" });
  const inspecteurs = prestataires.filter((p) => (p.types || []).includes("inspecteur"));
  const nomInspecteur = inspecteurs.find((p) => String(p.user?._id) === String(insp.inspecteur))?.raisonSociale;
  const patch = (chemin, corps) => appel(`/api/dossiers-import/${id}/${chemin}`, { method: "PATCH", body: JSON.stringify(corps) });

  return (
    <div className={css.grille2}>
      <fieldset className={css.bloc}>
        <legend>Inspection avant départ — {STATUTS_INSPECTION[insp.statut] || "Non demandée"}</legend>
        {insp.formule && <p className={css.muted}>{FORMULES_INSPECTION[insp.formule]?.libelle} · {insp.prix === 0 ? "incluse dans le pack" : `${insp.prix} USD`}{insp.demandeeLe ? ` · demandée le ${fmtDate(insp.demandeeLe)}` : ""}</p>}
        {insp.statut === "realisee" && (
          <>
            <p><strong style={{ color: VERDICTS[insp.verdict]?.couleur }}>{VERDICTS[insp.verdict]?.libelle}</strong> — le {fmtDate(insp.realiseeLe)}{insp.lieu ? ` à ${insp.lieu}` : ""}{insp.kilometrage != null ? ` · ${insp.kilometrage.toLocaleString("fr-FR")} km` : ""}{insp.vinConforme === false ? " · ⚠️ VIN non conforme" : ""}</p>
            <p className={css.muted}>{insp.synthese}</p>
            <ul className={css.historique}>
              {(insp.points || []).map((p) => <li key={p.rubrique}>{RUBRIQUES_INSPECTION.find((r) => r.code === p.rubrique)?.libelle} : <strong>{ETATS_RUBRIQUE[p.etat]}</strong>{p.note ? ` — ${p.note}` : ""}</li>)}
            </ul>
          </>
        )}
        {insp.statut !== "demandee" && d.statut === "en_cours" && (
          <div className={css.ligneForm}>
            <select value={formule} onChange={(e) => setFormule(e.target.value)} aria-label="Formule d'inspection">
              {Object.entries(FORMULES_INSPECTION).map(([k, v]) => <option key={k} value={k}>{v.libelle} — {v.prix} USD</option>)}
            </select>
            <button type="button" className={css.btn} disabled={occupe} onClick={() => patch("inspection", { formule, nouvelle: insp.statut === "realisee" })}>
              {insp.statut === "realisee" ? "Nouvelle inspection" : "Demander l'inspection"}
            </button>
          </div>
        )}
        {insp.statut === "demandee" && (
          <>
            <p className={css.muted}>Inspecteur : {nomInspecteur || (insp.inspecteur ? "affecté" : "aucun")}</p>
            <div className={css.ligneForm}>
              <select value={inspecteur} onChange={(e) => setInspecteur(e.target.value)} aria-label="Inspecteur">
                <option value="">Choisir un inspecteur…</option>
                {inspecteurs.map((p) => <option key={p._id} value={p.user?._id}>{p.raisonSociale}</option>)}
              </select>
              <button type="button" className={css.btn} disabled={occupe || !inspecteur} onClick={async () => { if (await patch("inspection", { inspecteur })) setInspecteur(""); }}>Affecter</button>
            </div>
            {!inspecteurs.length && <p className={css.muted}>Aucun inspecteur actif : invitez-en un depuis l'onglet ⚓ Zone Transit (métier « Inspecteur »).</p>}
          </>
        )}
        <p className={css.muted}>L'inspecteur rend son rapport depuis son espace Zone Transit. Un verdict « non conforme » bloque le paiement et l'embarquement.</p>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Assurance transport — {STATUTS_ASSURANCE[ass.statut] || "Non demandée"}</legend>
        {ass.garantie && <p className={css.muted}>{GARANTIES_ASSURANCE[ass.garantie]?.libelle} · valeur {ass.valeurAssuree} {ass.devise} · prime indicative {primeIndicative(ass.valeurAssuree, ass.garantie)} {ass.devise}</p>}
        {ass.prime != null && <p>Prime proposée : <strong>{ass.prime} {ass.devise}</strong>{ass.assureur ? ` — ${ass.assureur}` : ""}</p>}
        {ass.numeroPolice && <p>Police n° <strong>{ass.numeroPolice}</strong></p>}
        {["demandee", "proposee"].includes(ass.statut) && (
          <div className={css.ligneForm}>
            <input type="number" inputMode="decimal" value={proposition.prime} onChange={(e) => setProposition({ ...proposition, prime: e.target.value })} placeholder="Prime (USD)" aria-label="Prime" className={css.montant} />
            <input value={proposition.assureur} onChange={(e) => setProposition({ ...proposition, assureur: e.target.value })} placeholder="Assureur" aria-label="Assureur" />
            <button type="button" className={css.btn} disabled={occupe || !proposition.prime} onClick={() => patch("assurance", { statut: "proposee", ...proposition })}>Proposer au client</button>
          </div>
        )}
        {ass.statut === "acceptee" && (
          <div className={css.ligneForm}>
            <input value={police} onChange={(e) => setPolice(e.target.value)} placeholder="N° de police" aria-label="Numéro de police" />
            <button type="button" className={css.btn} disabled={occupe || !police.trim()} onClick={() => patch("assurance", { statut: "souscrite", numeroPolice: police })}>Souscription faite</button>
          </div>
        )}
        {["demandee", "proposee", "acceptee"].includes(ass.statut) && (
          <button type="button" className={css.btnSec} disabled={occupe} onClick={() => {
            const note = window.prompt("Motif transmis au client :");
            if (note) patch("assurance", { statut: "refusee", note });
          }}>Ne peut pas aboutir</button>
        )}
        <p className={css.muted}>Joignez l'attestation dans Documents (« Attestation d'assurance transport »).</p>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Financement — {STATUTS_FINANCEMENT[fin.statut] || "Non demandé"}</legend>
        {fin.montantDemande != null && (
          <p className={css.muted}>
            Demandé : {fin.montantDemande} {fin.devise} sur {fin.dureeMois} mois · apport {fin.apport || 0} · revenus {fin.revenusMensuels}/mois · {SITUATIONS_PRO[fin.situationPro] || "—"}
            {fin.demandeLe ? ` · le ${fmtDate(fin.demandeLe)}` : ""}
          </p>
        )}
        {fin.statut === "accorde" && <p>Accordé : <strong>{fin.montantAccorde} {fin.devise}</strong> à {fin.tauxAnnuel} % sur {fin.dureeMois} mois → <strong>{fin.mensualite} {fin.devise}/mois</strong>{fin.organisme ? ` (${fin.organisme})` : ""}</p>}
        {["demande", "en_etude"].includes(fin.statut) && (
          <>
            {fin.statut === "demande" && <button type="button" className={css.btnSec} disabled={occupe} onClick={() => patch("financement", { statut: "en_etude" })}>Mettre à l'étude</button>}
            <div className={css.grille3}>
              <label>Montant accordé<input type="number" inputMode="decimal" value={offre.montantAccorde} onChange={(e) => setOffre({ ...offre, montantAccorde: e.target.value })} /></label>
              <label>Taux annuel (%)<input type="number" inputMode="decimal" step="0.01" value={offre.tauxAnnuel} onChange={(e) => setOffre({ ...offre, tauxAnnuel: e.target.value })} /></label>
              <label>Durée
                <select value={offre.dureeMois || fin.dureeMois || ""} onChange={(e) => setOffre({ ...offre, dureeMois: e.target.value })}>
                  {DUREES_FINANCEMENT.map((n) => <option key={n} value={n}>{n} mois</option>)}
                </select>
              </label>
              <label>Frais de dossier<input type="number" inputMode="decimal" value={offre.fraisDossier} onChange={(e) => setOffre({ ...offre, fraisDossier: e.target.value })} placeholder="110 à 2 200" /></label>
              <label>Organisme<input value={offre.organisme} onChange={(e) => setOffre({ ...offre, organisme: e.target.value })} /></label>
              <label>Message au client<input value={offre.note} onChange={(e) => setOffre({ ...offre, note: e.target.value })} /></label>
            </div>
            <div className={css.actions}>
              <button type="button" className={css.btn} disabled={occupe || !offre.montantAccorde || offre.tauxAnnuel === ""}
                onClick={() => patch("financement", { statut: "accorde", ...offre, dureeMois: Number(offre.dureeMois || fin.dureeMois), fraisDossier: offre.fraisDossier === "" ? undefined : offre.fraisDossier })}>Accorder</button>
              <button type="button" className={css.btnDanger} disabled={occupe} onClick={() => patch("financement", { statut: "refuse", note: offre.note, organisme: offre.organisme })}>Refuser</button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
