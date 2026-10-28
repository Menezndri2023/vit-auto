import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "../shared.jsx";
import { LIBELLES_STATUT, TYPES_BESOIN, LIBELLES_DEVIS, nomPays, DONNEURS_ORDRE, PAYEURS, libelleDe, TYPES_DOCUMENT } from "../../../constants/logistique";
import css from "./DossiersImportSection.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — pilotage admin (2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Mise en relation GRATUITE (modèle FREE_REFERRAL) : rien ici ne facture. Les
// indicateurs ne lisent que des événements enregistrés ; un ratio sans
// données s'affiche « indisponible », jamais 0. La valeur d'une opération
// n'est pas un revenu de VIT AUTO.

const fmtMontants = (parDevise) => {
  const e = Object.entries(parDevise || {});
  return e.length ? e.map(([dev, m]) => `${Number(m).toLocaleString("fr-FR")} ${dev}`).join(" · ") : "—";
};
const indispo = (v, suffixe = "") => (v == null ? "indisponible" : `${v}${suffixe}`);

function Indicateurs({ appel }) {
  const [i, setI] = useState(null);
  const [erreur, setErreur] = useState("");
  const [periode, setPeriode] = useState({ depuis: "", jusqua: "" });
  const qs = new URLSearchParams(Object.entries(periode).filter(([, v]) => v)).toString();

  useEffect(() => {
    appel(`/api/logistique/admin/indicateurs${qs ? `?${qs}` : ""}`).then((r) => setI(r.indicateurs)).catch((e) => setErreur(e.message));
  }, [appel, qs]);

  const exporter = async () => {
    try {
      const r = await appel(`/api/logistique/admin/indicateurs.csv${qs ? `?${qs}` : ""}`, {}, true);
      const url = URL.createObjectURL(r);
      const a = document.createElement("a");
      a.href = url; a.download = "vit-auto-logistique-indicateurs.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErreur(e.message); }
  };

  return (
    <div className={css.panneau}>
      <div className={css.panneauEntete}>
        <h3>📊 Indicateurs</h3>
        <div className={css.filtres}>
          <label>Du <input type="date" value={periode.depuis} onChange={(e) => setPeriode((p) => ({ ...p, depuis: e.target.value }))} /></label>
          <label>au <input type="date" value={periode.jusqua} onChange={(e) => setPeriode((p) => ({ ...p, jusqua: e.target.value }))} /></label>
          <button type="button" className={css.btnSec} onClick={exporter}>Exporter (CSV)</button>
        </div>
      </div>
      {erreur && <p className={css.erreur}>{erreur}</p>}
      {!i ? <p className={css.muted}>Chargement…</p> : (
        <>
          <p className={css.muted}>
            Monétisation : <strong>désactivée</strong> — modèle {i.monetisation?.modeEconomique || "FREE_REFERRAL"}, commission {i.monetisation?.commissionActive ? "active" : "inactive"},
            taux {i.monetisation?.taux ?? "aucun"}, frais de mise en relation {i.monetisation?.fraisMiseEnRelationUSD ?? "aucun"}.
            Revenu logistique de VIT AUTO lu dans le registre des commissions : <strong>{i.revenusVitAuto?.montantUSD ?? 0}</strong> ({i.revenusVitAuto?.ecritures ?? 0} écriture).
          </p>
          <div className={css.grille3}>
            {[
              ["Demandes créées", i.demandes.creees], ["Soumises", i.demandes.soumises], ["Validées", i.demandes.valides],
              ["Transmises à des prestataires", i.demandes.transmises], ["Prestataires sollicités", i.prestataires.sollicites],
              ["Prestataires ayant répondu", i.prestataires.ayantRepondu], ["Devis reçus", i.prestataires.devisRecus],
              ["Devis acceptés", i.demandes.devisAcceptes], ["Commandes confirmées", i.demandes.commandesConfirmees],
              ["Opérations conclues", i.demandes.operationsConclues], ["Annulations", i.demandes.annulations], ["Litiges", i.demandes.litiges],
              ["Délai 1re réponse", indispo(i.delais.premiereReponseH, " h")], ["Demande → 1er devis", indispo(i.delais.demandeAuPremierDevisH, " h")],
              ["Conversion demande → devis", indispo(i.conversions.demandeVersDevis, " %")], ["Conversion devis → commande", indispo(i.conversions.devisVersCommande, " %")],
              ["Conversion commande → conclue", indispo(i.conversions.commandeVersConclue, " %")],
            ].map(([l, v]) => (
              <div key={l} className={css.bloc}><span className={css.muted}>{l}</span><strong>{v}</strong></div>
            ))}
          </div>
          <div className={css.tableWrap} style={{ marginTop: 12 }}>
            <table className={css.table}>
              <tbody>
                <tr><td>Montant des devis (déclaré)</td><td>{fmtMontants(i.montantsDeclares.devis)}</td></tr>
                <tr><td>Montant des commandes confirmées (déclaré)</td><td>{fmtMontants(i.montantsDeclares.commandes)}</td></tr>
                <tr><td>Valeur des opérations conclues (déclarée)</td><td>{fmtMontants(i.montantsDeclares.conclues)}</td></tr>
                <tr><td><strong>Revenus encaissés par VIT AUTO</strong></td><td><strong>0</strong> — aucune rémunération logistique</td></tr>
              </tbody>
            </table>
          </div>
          {i.prestataires.performance.length > 0 && (
            <div className={css.tableWrap} style={{ marginTop: 12 }}>
              <table className={css.table}>
                <thead><tr><th>Prestataire</th><th>Sollicité</th><th>Réponses</th><th>Devis</th><th>Retenu</th><th>Conclues</th><th>Délai moyen</th></tr></thead>
                <tbody>
                  {i.prestataires.performance.map((p) => (
                    <tr key={p.prestataire}><td>{p.prestataire}</td><td>{p.sollicitations}</td><td>{p.reponses}</td><td>{p.devis}</td><td>{p.retenus}</td><td>{p.conclues}</td><td>{indispo(p.delaiMoyenReponseH, " h")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {i.evenementsDeclencheursPotentiels?.length > 0 && (
            <div className={css.tableWrap} style={{ marginTop: 12 }}>
              <table className={css.table}>
                <thead><tr><th>Événement qui pourrait déclencher une rémunération</th><th>Usage envisageable</th><th>Nombre</th><th>État</th></tr></thead>
                <tbody>{i.evenementsDeclencheursPotentiels.map((e) => <tr key={e.code}><td>{e.libelle}</td><td>{e.usage}</td><td>{e.nombre}</td><td>Inactif</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {i.zones.length > 0 && <p className={css.muted} style={{ marginTop: 10 }}>Trajets les plus demandés : {i.zones.slice(0, 6).map((z) => `${z.route} (${z.demandes})`).join(" · ")}</p>}
          {i.motifs.annulation.length > 0 && <p className={css.muted}>Motifs d'annulation : {i.motifs.annulation.slice(0, 5).join(" · ")}</p>}
        </>
      )}
    </div>
  );
}

function Detail({ id, appel, onRetour }) {
  const [d, setD] = useState(null);
  const [compatibles, setCompatibles] = useState([]);
  const [choix, setChoix] = useState([]);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await appel(`/api/logistique/admin/demandes/${id}`);
      setD(r.demande);
      const c = await appel(`/api/logistique/admin/demandes/${id}/compatibles`);
      setCompatibles(c.prestataires || []);
    } catch (e) { setErreur(e.message); }
  }, [appel, id]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (chemin, corps, msg) => {
    setOccupe(true); setErreur(""); setInfo("");
    try {
      await appel(`/api/logistique/admin/demandes/${id}/${chemin}`, { method: "POST", body: JSON.stringify(corps) });
      setInfo(msg); setNote(""); setChoix([]);
      await charger();
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };

  if (!d) return <div className={css.panneau}>{erreur ? <p className={css.erreur}>{erreur}</p> : <p className={css.muted}>Chargement…</p>}</div>;
  const m = d.marchandise || {};

  return (
    <div className={css.panneau}>
      <button type="button" className={css.btnSec} onClick={onRetour}>← Toutes les demandes</button>
      <h3 style={{ marginTop: 10 }}>{d.reference} — {LIBELLES_STATUT[d.statut]}</h3>
      {info && <p className={css.muted} role="status">✅ {info}</p>}
      {erreur && <p className={css.erreur} role="alert">{erreur}</p>}

      <div className={css.bloc}>
        <p><strong>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</strong> · {d.depart.ville} ({nomPays(d.depart.pays)}) → {d.arrivee.ville} ({nomPays(d.arrivee.pays)})</p>
        <p className={css.muted}>
          {d.typeBesoin === "vehicule" ? [m.vehicule?.marque, m.vehicule?.modele, m.vehicule?.annee].filter(Boolean).join(" ") : m.description}
          {m.poidsKg ? ` · ${m.poidsKg} kg` : ""}{d.dateSouhaitee ? ` · souhaité le ${fmtDate(d.dateSouhaitee)}` : ""}
        </p>
        {d.commandeLiee && <p className={css.muted}>Commande liée : {d.commandeLiee.libelle}{d.commandeLiee.reference ? ` — ${d.commandeLiee.reference}` : ""}{d.liens?.booking?.status ? ` (statut : ${d.liens.booking.status})` : d.liens?.transaction?.status ? ` (statut : ${d.liens.transaction.status})` : ""}</p>}
        <p className={css.muted}>Client : {d.client ? `${d.client.firstName || ""} ${d.client.lastName || ""}`.trim() : "—"} · {d.contact?.telephone} {d.contact?.email}</p>
        {m.contraintes && <p className={css.muted}>Contraintes : {m.contraintes}</p>}
        {(d.parties?.acheteur || d.parties?.vendeur) && (
          <p className={css.muted}>
            Acheteur : {d.parties?.acheteur ? `${d.parties.acheteur.firstName || ""} ${d.parties.acheteur.lastName || ""}`.trim() : "—"} ·
            Vendeur : {d.parties?.vendeur ? `${d.parties.vendeur.firstName || ""} ${d.parties.vendeur.lastName || ""}`.trim() : "—"} ·
            Demandeur : {d.roleDemandeur}
          </p>
        )}
        <p className={css.muted}>
          Incoterm de la commande : {d.incotermCommande?.regle ? `${d.incotermCommande.regle} ${d.incotermCommande.lieuNomme || ""}, Incoterms® ${d.incotermCommande.version || "2020"} (${d.incotermCommande.statut})` : "—"} ·
          Commande le transport : {libelleDe(DONNEURS_ORDRE, d.donneurOrdre)} · Paie : {libelleDe(PAYEURS, d.payeur)}
        </p>
        {d.enlevement?.confirmeLe && <p className={css.muted}>Enlèvement confirmé le {fmtDate(d.enlevement.confirmeLe)} : {d.enlevement.lieu}{d.enlevement.poidsKg != null ? ` · ${d.enlevement.poidsKg} kg` : ""}{d.enlevement.volumeM3 != null ? ` · ${d.enlevement.volumeM3} m³` : ""}</p>}
        {d.devisAccepte?.accepteLe && <p className={css.muted}>Devis accepté (version {d.devisAccepte.version}) le {fmtDate(d.devisAccepte.accepteLe)} — partie contractante déclarée : {libelleDe(DONNEURS_ORDRE, d.devisAccepte.partieContractante)} · payeur : {libelleDe(PAYEURS, d.devisAccepte.payeur)}. L'acceptation n'est pas un paiement.</p>}
        {(d.documents || []).length > 0 && (
          <ul className={css.historique}>
            {d.documents.map((doc) => <li key={doc._id}><a href={doc.url} target="_blank" rel="noreferrer">{TYPES_DOCUMENT[doc.type] || doc.type}</a> — {doc.role}, {fmtDate(doc.deposeLe)} — non vérifié</li>)}
          </ul>
        )}
        {d.litige?.motif && <p className={css.erreur}>Litige : {d.litige.motif}</p>}
      </div>

      {["recue", "infos_requises"].includes(d.statut) && (
        <div className={css.bloc}>
          <h4>Qualification</h4>
          <textarea aria-label="Note de qualification" placeholder="Note (obligatoire pour demander des précisions)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", minHeight: 60 }} />
          <div className={css.actions}>
            <button type="button" className={css.btn} disabled={occupe} onClick={() => agir("qualifier", { decision: "valider", note }, "Demande validée.")}>Valider</button>
            <button type="button" className={css.btnSec} disabled={occupe || !note.trim()} onClick={() => agir("qualifier", { decision: "infos", note }, "Précisions demandées au client.")}>Demander des précisions</button>
            <button type="button" className={css.btnDanger} disabled={occupe} onClick={() => window.confirm("Refuser cette demande ?") && agir("qualifier", { decision: "refuser", note }, "Demande refusée.")}>Refuser</button>
          </div>
        </div>
      )}

      {["validee", "recherche_prestataires", "devis_recus"].includes(d.statut) && (
        <div className={css.bloc}>
          <h4>Solliciter des prestataires compatibles</h4>
          {compatibles.length === 0 ? <p className={css.muted}>Aucun transporteur ou transitaire actif ne couvre {d.depart.pays} ou {d.arrivee.pays}. Invitez-en depuis « Zone Transit ».</p> : (
            <>
              {compatibles.map((p) => (
                <label key={p._id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
                  <input type="checkbox" disabled={p.dejaSollicite} checked={p.dejaSollicite || choix.includes(p._id)}
                    onChange={(e) => setChoix((c) => (e.target.checked ? [...c, p._id] : c.filter((x) => x !== p._id)))} />
                  {p.raisonSociale} — {p.types.join(", ")} — {p.pays.join(", ")}{p.couvreLesDeux ? " · couvre départ et arrivée" : ""}{p.dejaSollicite ? " (déjà sollicité)" : ""}
                </label>
              ))}
              <div className={css.actions}>
                <button type="button" className={css.btn} disabled={occupe || !choix.length} onClick={() => agir("solliciter", { prestataires: choix }, "Prestataires sollicités.")}>Solliciter ({choix.length})</button>
              </div>
            </>
          )}
        </div>
      )}

      {(d.sollicitations || []).length > 0 && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr><th>Prestataire sollicité</th><th>Le</th><th>Réponse</th><th>Message</th></tr></thead>
            <tbody>{d.sollicitations.map((s) => <tr key={s._id}><td>{s.prestataire?.raisonSociale}</td><td>{fmtDate(s.solliciteLe)}</td><td>{s.reponse}</td><td>{s.message || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {(d.devis || []).length > 0 && (
        <div className={css.tableWrap} style={{ marginTop: 10 }}>
          <table className={css.table}>
            <thead><tr><th>Devis</th><th>Version</th><th>Montant</th><th>Délai</th><th>Validité</th><th>Statut</th></tr></thead>
            <tbody>{d.devis.map((x) => <tr key={x._id}><td>{x.prestataire?.raisonSociale}</td><td>{x.version}</td><td>{Number(x.montant).toLocaleString("fr-FR")} {x.devise}</td><td>{x.delaiJoursMin ?? "?"}–{x.delaiJoursMax ?? "?"} j</td><td>{fmtDate(x.valideJusquau)}</td><td>{LIBELLES_DEVIS[x.statut]}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {!["cloturee", "annulee"].includes(d.statut) && (
        <div className={css.bloc}>
          <h4>Intervention (note obligatoire, tracée)</h4>
          <textarea aria-label="Note d'intervention" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", minHeight: 60 }} />
          <div className={css.actions}>
            {d.statut === "litige" && <button type="button" className={css.btn} disabled={occupe || !note.trim()} onClick={() => agir("intervention", { statut: "cloturee", note }, "Litige résolu, opération clôturée.")}>Résoudre et clôturer</button>}
            {d.statut === "livraison_declaree" && <button type="button" className={css.btnSec} disabled={occupe || !note.trim()} onClick={() => agir("intervention", { statut: "cloturee", note }, "Clôturée sur justificatif.")}>Clôturer sur justificatif</button>}
            <button type="button" className={css.btnDanger} disabled={occupe || !note.trim()} onClick={() => window.confirm("Annuler cette demande ?") && agir("intervention", { statut: "annulee", note }, "Demande annulée.")}>Annuler</button>
          </div>
        </div>
      )}

      <div className={css.bloc}>
        <h4>Historique</h4>
        <ul className={css.historique}>
          {[...(d.evenements || [])].reverse().map((e) => (
            <li key={e._id}>{fmtDate(e.date)} — {e.role} — {e.statut ? LIBELLES_STATUT[e.statut] : e.type}{e.reference ? ` — suivi ${e.reference}` : ""}{e.note ? ` — ${e.note}` : ""}{e.visibleClient ? "" : " (interne)"}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LogistiqueSection({ headers }) {
  const [demandes, setDemandes] = useState([]);
  const [filtres, setFiltres] = useState({ statut: "", q: "", retard: "" });
  const [selection, setSelection] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  const appel = useCallback(async (url, options = {}, brut = false) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...headers } });
    if (brut) { if (!r.ok) throw new Error("Export impossible."); return r.blob(); }
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.message || "Erreur.");
    return c;
  }, [headers]);

  const qs = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString();
  useEffect(() => {
    if (selection) return;
    setChargement(true);
    appel(`/api/logistique/admin/demandes${qs ? `?${qs}` : ""}`)
      .then((r) => { setDemandes(r.demandes || []); setErreur(""); })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, [appel, qs, selection]);

  if (selection) return <section className={css.section}><Detail id={selection} appel={appel} onRetour={() => setSelection(null)} /></section>;

  return (
    <section className={css.section}>
      <h2>📦 VIT-AUTO Logistique — mise en relation gratuite</h2>
      <p className={css.muted}>Demandes de transport de véhicules et de pièces. VIT AUTO qualifie, sollicite les prestataires de la Zone Transit et trace le dossier ; elle ne facture rien.</p>
      <Indicateurs appel={appel} />
      <div className={css.panneau}>
        <div className={css.panneauEntete}>
          <h3>Demandes</h3>
          <div className={css.filtres}>
            <select aria-label="Filtrer par statut" value={filtres.statut} onChange={(e) => setFiltres((f) => ({ ...f, statut: e.target.value }))}>
              <option value="">Tous les statuts</option>
              {Object.entries(LIBELLES_STATUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label="Rechercher" placeholder="Référence, ville, client…" value={filtres.q} onChange={(e) => setFiltres((f) => ({ ...f, q: e.target.value }))} />
            <label><input type="checkbox" checked={filtres.retard === "1"} onChange={(e) => setFiltres((f) => ({ ...f, retard: e.target.checked ? "1" : "" }))} /> Sans réponse &gt; 48 h</label>
          </div>
        </div>
        {erreur && <p className={css.erreur}>{erreur}</p>}
        {chargement ? <p className={css.muted}>Chargement…</p> : demandes.length === 0 ? <p className={css.muted}>Aucune demande.</p> : (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead><tr><th>Référence</th><th>Créée</th><th>Besoin</th><th>Trajet</th><th>Statut</th><th>Sollicités</th><th>Devis</th><th /></tr></thead>
              <tbody>
                {demandes.map((d) => (
                  <tr key={d._id}>
                    <td>{d.reference}{d.enRetard ? " ⏰" : ""}</td>
                    <td>{fmtDate(d.createdAt)}</td>
                    <td>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</td>
                    <td>{d.depart?.pays} → {d.arrivee?.pays}</td>
                    <td>{LIBELLES_STATUT[d.statut]}</td>
                    <td>{(d.sollicitations || []).length}</td>
                    <td>{(d.devis || []).filter((x) => !["remplace", "retire"].includes(x.statut)).length}</td>
                    <td><button type="button" className={css.btnSec} onClick={() => setSelection(d._id)}>Ouvrir</button></td>
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
