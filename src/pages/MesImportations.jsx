import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ETAPES, rangEtape, libelleEtape, nomPays, STATUTS_DOCUMENT, STATUTS_PACK } from "../constants/dossierImport";
import styles from "./MesImportations.module.css";

// Suivi des importations (2026-10-07) : chaque demande d'accompagnement ou
// achat d'une annonce export devient un dossier suivi par un conseiller VIT
// AUTO. Le client voit ici où en est son véhicule, étape par étape.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtMontant = (n, devise = "USD") => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise}`);

function useApi() {
  const { token } = useAuth();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.message || "Erreur réseau.");
    return corps;
  }, [token]);
}

function Progression({ etape }) {
  const rang = rangEtape(etape);
  const pct = Math.round(((rang + 1) / ETAPES.length) * 100);
  return (
    <div className={styles.progression} aria-label={`Avancement : ${libelleEtape(etape)}`}>
      <div className={styles.barre}><span style={{ width: `${pct}%` }} /></div>
      <span className={styles.progressionTexte}>{libelleEtape(etape)}</span>
    </div>
  );
}

function Liste() {
  const api = useApi();
  const [etat, setEtat] = useState({ chargement: true, dossiers: [], erreur: "" });

  useEffect(() => {
    api("/api/dossiers-import/mes")
      .then((d) => setEtat({ chargement: false, dossiers: d.dossiers || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, dossiers: [], erreur: e.message }));
  }, [api]);

  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>📦 Mes importations</h1>
      <p className={styles.intro}>Suivez chaque étape de l'importation de votre véhicule, du devis jusqu'à l'immatriculation.</p>
      {etat.chargement && <p className={styles.attente}>Chargement…</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.dossiers.length === 0 && (
        <div className={styles.vide}>
          <p>Vous n'avez pas encore de dossier d'import.</p>
          <Link to="/import-export" className={styles.bouton}>Faire importer un véhicule</Link>
        </div>
      )}
      <div className={styles.grille}>
        {etat.dossiers.map((d) => (
          <Link key={d._id} to={`/mes-importations/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}>
              <strong>{d.vehicule?.titre || "Véhicule à définir"}</strong>
              <span className={styles.reference}>{d.reference}</span>
            </div>
            <p className={styles.trajet}>{nomPays(d.origine?.pays)} → {nomPays(d.destination?.pays)}</p>
            {d.statut === "annule"
              ? <p className={styles.annule}>Dossier annulé</p>
              : <Progression etape={d.etape} />}
            <p className={styles.maj}>Mis à jour le {fmtDate(d.updatedAt)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Detail({ id }) {
  const api = useApi();
  const [dossier, setDossier] = useState(null);
  const [erreur, setErreur] = useState("");
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => {
    api(`/api/dossiers-import/${id}`).then((d) => setDossier(d.dossier)).catch((e) => setErreur(e.message));
  }, [api, id]);
  useEffect(() => { charger(); }, [charger]);

  const declarer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      const d = await api(`/api/dossiers-import/${id}/pack/declarer`, { method: "POST", body: JSON.stringify({ reference }) });
      setDossier(d.dossier);
      setReference("");
    } catch (err) { setErreur(err.message); } finally { setEnvoi(false); }
  };

  if (erreur && !dossier) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p></div>;
  if (!dossier) return <div className={styles.page}><p className={styles.attente}>Chargement…</p></div>;

  const rang = rangEtape(dossier.etape);
  const datesParEtape = Object.fromEntries((dossier.historique || []).map((h) => [h.etape, h.date]));
  const dernieresNotes = [...(dossier.historique || [])].reverse().filter((h) => h.note).slice(0, 5);
  const exp = dossier.expedition || {};

  return (
    <div className={styles.page}>
      <Link to="/mes-importations" className={styles.retour}>← Mes importations</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{dossier.vehicule?.titre || "Véhicule à définir"}</h1>
          <p className={styles.trajet}>{nomPays(dossier.origine?.pays)} → {nomPays(dossier.destination?.pays)}{dossier.destination?.ville ? ` (${dossier.destination.ville})` : ""}</p>
        </div>
        <span className={styles.reference}>{dossier.reference}</span>
      </div>
      {erreur && <p className={styles.erreur}>{erreur}</p>}
      {dossier.statut === "annule" && <p className={styles.annule}>Dossier annulé{dossier.motifAnnulation ? ` : ${dossier.motifAnnulation}` : ""}.</p>}

      {dossier.conseiller && (
        <div className={styles.encart}>
          👤 Votre conseiller VIT AUTO : <strong>{dossier.conseiller.firstName} {dossier.conseiller.lastName}</strong>
          {dossier.conseiller.email && <> — <a href={`mailto:${dossier.conseiller.email}`}>{dossier.conseiller.email}</a></>}
        </div>
      )}

      <section className={styles.bloc}>
        <h2>Suivi</h2>
        <ol className={styles.frise}>
          {ETAPES.map((e, i) => (
            <li key={e.code} className={i < rang ? styles.fait : i === rang ? styles.encours : styles.avenir}>
              <span className={styles.pastille}>{i <= rang ? e.icone : ""}</span>
              <span className={styles.libelle}>{e.libelle}</span>
              {datesParEtape[e.code] && <span className={styles.date}>{fmtDate(datesParEtape[e.code])}</span>}
            </li>
          ))}
        </ol>
        {dernieresNotes.length > 0 && (
          <ul className={styles.notes}>
            {dernieresNotes.map((h) => <li key={h._id}><strong>{fmtDate(h.date)}</strong> — {h.note}</li>)}
          </ul>
        )}
      </section>

      {(exp.compagnie || exp.numeroBL || exp.arriveePrevueLe) && (
        <section className={styles.bloc}>
          <h2>Expédition</h2>
          <dl className={styles.infos}>
            {exp.compagnie && <><dt>Compagnie</dt><dd>{exp.compagnie}{exp.navire ? ` — ${exp.navire}` : ""}</dd></>}
            {exp.mode && <><dt>Mode</dt><dd>{exp.mode === "roro" ? "Roulier (RoRo)" : "Conteneur"}</dd></>}
            {exp.numeroBL && <><dt>Connaissement</dt><dd>{exp.numeroBL}</dd></>}
            {exp.numeroConteneur && <><dt>Conteneur</dt><dd>{exp.numeroConteneur}</dd></>}
            {exp.departLe && <><dt>Départ</dt><dd>{fmtDate(exp.departLe)}</dd></>}
            {exp.arriveePrevueLe && <><dt>Arrivée prévue</dt><dd>{fmtDate(exp.arriveePrevueLe)}</dd></>}
          </dl>
        </section>
      )}

      {dossier.pack?.code && (
        <section className={styles.bloc}>
          <h2>Accompagnement {dossier.pack.code}</h2>
          <p>{fmtMontant(dossier.pack.prix, dossier.pack.devise)} — <strong>{STATUTS_PACK[dossier.pack.statut]}</strong></p>
          {dossier.pack.statut === "a_regler" && dossier.pack.prix != null && (
            <form onSubmit={declarer} className={styles.formulaire}>
              <p className={styles.aide}>Réglez les frais d'accompagnement selon les instructions de votre conseiller, puis indiquez ici la référence de votre virement ou paiement.</p>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence du paiement" aria-label="Référence du paiement" required />
              <button type="submit" className={styles.bouton} disabled={envoi || !reference.trim()}>{envoi ? "Envoi…" : "J'ai réglé"}</button>
            </form>
          )}
        </section>
      )}

      {dossier.devis?.lignes?.length > 0 && dossier.devis.envoyeLe && (
        <section className={styles.bloc}>
          <h2>Devis</h2>
          <table className={styles.tableau}>
            <tbody>
              {dossier.devis.lignes.map((l, i) => <tr key={i}><td>{l.libelle}</td><td>{fmtMontant(l.montant, dossier.devis.devise)}</td></tr>)}
              <tr className={styles.total}><td>Total estimé</td><td>{fmtMontant(dossier.devis.total, dossier.devis.devise)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section className={styles.bloc}>
        <h2>Documents</h2>
        <ul className={styles.documents}>
          {(dossier.documents || []).filter((d) => d.statut !== "non_requis").map((d) => (
            <li key={d.code}>
              <span>{d.libelle}</span>
              <span className={styles.statutDoc} style={{ color: STATUTS_DOCUMENT[d.statut]?.couleur }}>
                {STATUTS_DOCUMENT[d.statut]?.libelle}
              </span>
              {d.url && <a href={d.url} target="_blank" rel="noreferrer">Ouvrir</a>}
            </li>
          ))}
        </ul>
      </section>

      {dossier.source?.transaction && (
        <p className={styles.aide}>
          Paiement et échanges avec l'exportateur : <Link to={`/import-export/transaction/${dossier.source.transaction}`}>voir la transaction</Link>.
        </p>
      )}
    </div>
  );
}

export default function MesImportations() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!token) navigate("/login", { state: { from: { pathname: id ? `/mes-importations/${id}` : "/mes-importations" } } });
  }, [token, navigate, id]);
  if (!token) return null;
  return id ? <Detail id={id} /> : <Liste />;
}
