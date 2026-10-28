import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "../shared.jsx";
import css from "./DossiersImportSection.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// Tableau de bord de direction (prompt maître §13, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Volume d'affaires, commissions calculées, commissions encaissées, coûts et
// résultat sont TOUJOURS séparés. Une donnée non mesurée s'affiche
// « indisponible », jamais 0. Montants par devise, jamais additionnés entre
// devises. Comptes de test exclus (calcul serveur).

const indispo = (v, suffixe = "") => (v == null ? "indisponible" : `${v}${suffixe}`);
const montants = (m) => {
  const e = Object.entries(m || {});
  return e.length ? e.map(([dev, v]) => `${Number(v).toLocaleString("fr-FR")} ${dev}`).join(" · ") : "—";
};
const STATUTS = { inscrit: "Inscrit", verifie: "Vérifié", active: "Activé", suspendu: "Suspendu" };
const CRITERES = { profilComplet: "profil", verifie: "documents", offresExploitables: "offre", joignable: "contact" };

function Tuiles({ titre, items }) {
  return (
    <div className={css.panneau}>
      <h3>{titre}</h3>
      <div className={css.grille3}>
        {items.map(([l, v]) => <div key={l} className={css.bloc}><span className={css.muted}>{l}</span><strong>{v}</strong></div>)}
      </div>
    </div>
  );
}

export function DirectionSection({ headers }) {
  const [d, setD] = useState(null);
  const [liste, setListe] = useState([]);
  const [filtre, setFiltre] = useState("");
  const [periode, setPeriode] = useState({ depuis: "", jusqua: "" });
  const [erreur, setErreur] = useState("");

  const appel = useCallback(async (url) => {
    const r = await fetch(url, { headers });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.message || "Erreur.");
    return c;
  }, [headers]);

  const qs = new URLSearchParams(Object.entries(periode).filter(([, v]) => v)).toString();
  useEffect(() => {
    setErreur("");
    appel(`/api/analytics/direction${qs ? `?${qs}` : ""}`).then((r) => setD(r.direction)).catch((e) => setErreur(e.message));
  }, [appel, qs]);
  useEffect(() => {
    appel(`/api/analytics/activation${filtre ? `?statut=${filtre}` : ""}`).then((r) => setListe(r.partenaires || [])).catch(() => setListe([]));
  }, [appel, filtre]);

  return (
    <section className={css.section}>
      <h2>🧭 Tableau de bord de direction</h2>
      <div className={css.filtres}>
        <label>Du <input type="date" value={periode.depuis} onChange={(e) => setPeriode((p) => ({ ...p, depuis: e.target.value }))} /></label>
        <label>au <input type="date" value={periode.jusqua} onChange={(e) => setPeriode((p) => ({ ...p, jusqua: e.target.value }))} /></label>
        <span className={css.muted}>Par défaut : 12 derniers mois. Comptes de test exclus.</span>
      </div>
      {erreur && <p className={css.erreur}>{erreur}</p>}
      {!d ? <p className={css.muted}>Chargement…</p> : (
        <>
          <Tuiles titre="Partenaires" items={[
            ["Inscrits", d.partenaires.inscrits], ["Vérifiés (documents)", d.partenaires.verifies], ["Activés", d.partenaires.actives],
            ["Suspendus", d.partenaires.suspendus], ["Délai moyen de réponse", indispo(d.partenaires.delaiMoyenReponseMin, " min")],
          ]} />
          <Tuiles titre="Offres publiées et disponibles" items={[
            ["Location", d.offresDisponibles.location], ["Vente", d.offresDisponibles.vente], ["Chauffeurs", d.offresDisponibles.chauffeurs],
            ["Activités", d.offresDisponibles.activites], ["Pièces", d.offresDisponibles.pieces], ["Trade", d.offresDisponibles.trade],
          ]} />
          <Tuiles titre="Demandes, réponses et conversion (période)" items={[
            ["Réservations", d.demandes.reservations], ["Demandes d'essai", d.demandes.demandesEssai], ["… dont qualifiées", d.demandes.demandesEssaiQualifiees],
            ["Transactions Trade", d.demandes.transactionsTrade], ["Logistique soumises", d.demandes.logistiqueSoumises], ["… dont qualifiées", d.demandes.logistiqueQualifiees],
            ["Délai réponse réservations", indispo(d.delaisReponseMin.reservations, " min")], ["Délai réponse essais", indispo(d.delaisReponseMin.demandesEssai, " min")],
            ["Réservation → finalisée", indispo(d.conversions.reservationVersFinalisee, " %")], ["Essai → vente", indispo(d.conversions.demandeEssaiVersVente, " %")],
            ["Trade → finalisée", indispo(d.conversions.tradeVersFinalisee, " %")], ["Logistique → conclue", indispo(d.conversions.logistiqueVersConclue, " %")],
          ]} />

          <div className={css.panneau}>
            <h3>Économie — cinq notions séparées</h3>
            <div className={css.tableWrap}>
              <table className={css.table}>
                <tbody>
                  <tr><td><strong>1. Volume d'affaires</strong> — réservations finalisées</td><td>{montants(d.volumeAffaires.reservations)}</td></tr>
                  <tr><td>… ventes conclues (déclarées)</td><td>{montants(d.volumeAffaires.ventes)}</td></tr>
                  <tr><td>… transactions Trade finalisées</td><td>{montants(d.volumeAffaires.trade)}</td></tr>
                  <tr><td>… logistique conclue (valeur déclarée entre les parties)</td><td>{montants(d.volumeAffaires.logistiqueDeclaree)}</td></tr>
                  <tr><td><strong>2. Revenu brut de commission</strong> (calculé, hors annulées)</td><td>{montants(d.commissionsCalculees)}</td></tr>
                  <tr><td><strong>3. Commissions effectivement encaissées</strong></td><td>{montants(d.commissionsEncaissees)}</td></tr>
                  <tr><td>… dont logistique</td><td>{d.revenuLogistique} (mise en relation gratuite)</td></tr>
                  <tr><td><strong>4. Coûts d'exploitation</strong> · coût d'acquisition</td><td>{indispo(d.coutsExploitation)} · {indispo(d.coutAcquisition)}</td></tr>
                  <tr><td><strong>5. Résultat économique estimé</strong></td><td>{indispo(d.resultatEstime)}</td></tr>
                </tbody>
              </table>
            </div>
            {d.nonMesure.map((n) => <p key={n} className={css.muted}>ⓘ {n}</p>)}
            <p className={css.muted}>Commissions par statut : {Object.entries(d.commissionsParStatut).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</p>
          </div>

          <Tuiles titre="Annulations, litiges et remboursements" items={[
            ["Réservations annulées", d.annulations.reservations], ["Trade annulées", d.annulations.trade], ["Logistique annulées", d.annulations.logistique],
            ["Litiges logistique", d.annulations.litigesLogistique], ["Remboursements", d.remboursements.nombre], ["Montants remboursés", montants(d.remboursements.montants)],
          ]} />

          <div className={css.panneau}>
            <h3>Activité dans le temps</h3>
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead><tr><th>Mois</th><th>Nouveaux partenaires</th><th>… activés aujourd'hui</th><th>Réservations créées</th></tr></thead>
                <tbody>{d.activiteParMois.map((m) => <tr key={m.mois}><td>{m.mois}</td><td>{m.nouveauxPartenaires}</td><td>{m.dontActivesAujourdhui}</td><td>{m.reservations}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className={css.panneau}>
        <div className={css.panneauEntete}>
          <h3>Suivi de l'activation des partenaires</h3>
          <div className={css.filtres}>
            <select aria-label="Filtrer par statut d'activation" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <p className={css.muted}>Activé = profil complet, documents vérifiés pour son métier, au moins une offre approuvée, disponible et chiffrée, contact vérifié. Un compte créé n'est pas activé.</p>
        {liste.length === 0 ? <p className={css.muted}>Aucun partenaire.</p> : (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead><tr><th>Partenaire</th><th>Inscrit le</th><th>Statut</th><th>Manque</th><th>Offres</th><th>Demandes reçues / traitées</th><th>Délai moyen</th></tr></thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p._id}>
                    <td>{p.nom || p.email}{p.fondateur ? " 👑" : ""}<br /><span className={css.muted}>{p.metiers?.join(", ")} {p.pays || ""}</span></td>
                    <td>{fmtDate(p.inscritLe)}</td>
                    <td>{STATUTS[p.statut]}</td>
                    <td>{p.manquants?.length ? p.manquants.map((m) => CRITERES[m.code]).join(", ") : "—"}</td>
                    <td>{p.offres?.total ?? 0}</td>
                    <td>{p.premieresDemandes?.recues ?? 0} / {p.premieresDemandes?.repondues ?? 0}</td>
                    <td>{indispo(p.premieresDemandes?.delaiMoyenReponseMin, " min")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
