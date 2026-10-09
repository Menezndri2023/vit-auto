import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ETAPES, rangEtape, libelleEtape, nomPays, STATUTS_DOCUMENT, FORMULES_INSPECTION, RUBRIQUES_INSPECTION, ETATS_RUBRIQUE, VERDICTS } from "../constants/dossierImport";
import styles from "./MesImportations.module.css";

// Espace des prestataires de la zone Transit (2026-10-07) : les dossiers
// d'import affectés par VIT AUTO, les étapes logistiques à faire avancer, les
// documents à déposer (VIT AUTO les valide), les informations d'expédition.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const lireFichier = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error("Lecture impossible.")); r.readAsDataURL(f); });

function useApi() {
  const { token } = useAuth();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.message || "Erreur réseau.");
    return c;
  }, [token]);
}

function Liste() {
  const api = useApi();
  const [etat, setEtat] = useState({ chargement: true, dossiers: [], erreur: "" });
  useEffect(() => {
    api("/api/transit/dossiers").then((c) => setEtat({ chargement: false, dossiers: c.dossiers || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, dossiers: [], erreur: e.message }));
  }, [api]);
  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>🚢 Zone Transit</h1>
      <p className={styles.intro}>Les importations que VIT AUTO vous a confiées.</p>
      {etat.chargement && <p className={styles.attente}>Chargement…</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.dossiers.length === 0 && <div className={styles.vide}><p>Aucun dossier ne vous est encore affecté.</p></div>}
      <div className={styles.grille}>
        {etat.dossiers.map((d) => (
          <Link key={d._id} to={`/transit/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}><strong>{d.vehicule?.titre || "Véhicule"}</strong><span className={styles.reference}>{d.reference}</span></div>
            <p className={styles.trajet}>{nomPays(d.origine?.pays)} → {nomPays(d.destination?.pays)}{d.destination?.port ? ` (${d.destination.port})` : ""}</p>
            <p className={styles.progressionTexte}>{d.statut === "annule" ? "Annulé" : libelleEtape(d.etape)}</p>
            <p className={styles.maj}>Mis à jour le {fmtDate(d.updatedAt)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Rapport de l'inspecteur affecté (étape 3, 2026-10-09) : une fois rendu, il
// n'est plus modifiable ; un verdict « non conforme » bloque le dossier.
function RapportInspection({ id, dossier, api, onDossier }) {
  const insp = dossier.inspection || {};
  const [r, setR] = useState({ lieu: "", kilometrage: "", vinConforme: "oui", synthese: "", verdict: "" });
  const [points, setPoints] = useState(() => Object.fromEntries(RUBRIQUES_INSPECTION.map((x) => [x.code, { etat: "non_verifie", note: "" }])));
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const champ = { display: "block", width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 16, boxSizing: "border-box" };

  if (insp.statut === "realisee") {
    return (
      <section className={styles.bloc}>
        <h2>Votre rapport d'inspection</h2>
        <p><strong style={{ color: VERDICTS[insp.verdict]?.couleur }}>{VERDICTS[insp.verdict]?.libelle}</strong> — le {fmtDate(insp.realiseeLe)}</p>
        <p>{insp.synthese}</p>
      </section>
    );
  }
  const envoyer = async (e) => {
    e.preventDefault();
    if (r.verdict === "non_conforme" && !window.confirm("Confirmer « non conforme » ? Le paiement et l'embarquement seront bloqués.")) return;
    setOccupe(true); setErreur("");
    try {
      const corps = {
        ...r, kilometrage: r.kilometrage === "" ? null : Number(r.kilometrage), vinConforme: r.vinConforme === "oui",
        points: Object.entries(points).map(([rubrique, v]) => ({ rubrique, ...v })),
      };
      const c = await api(`/api/transit/dossiers/${id}/inspection`, { method: "POST", body: JSON.stringify(corps) });
      onDossier(c.dossier);
    } catch (err) { setErreur(err.message); } finally { setOccupe(false); }
  };
  return (
    <section className={styles.bloc}>
      <h2>🛠️ Rapport d'inspection — {FORMULES_INSPECTION[insp.formule]?.libelle || "inspection"}</h2>
      <p className={styles.aide}>Vous inspectez pour le compte de l'acheteur, en toute indépendance du vendeur. Joignez aussi le rapport complet et les photos dans « Documents » (Rapport d'inspection avant départ).</p>
      {erreur && <p className={styles.erreur}>{erreur}</p>}
      <form onSubmit={envoyer} style={{ display: "grid", gap: 12 }}>
        <label className={styles.aide}>Lieu de l'inspection<input value={r.lieu} onChange={(e) => setR({ ...r, lieu: e.target.value })} style={champ} /></label>
        <label className={styles.aide}>Kilométrage relevé<input type="number" inputMode="numeric" min="0" value={r.kilometrage} onChange={(e) => setR({ ...r, kilometrage: e.target.value })} style={champ} /></label>
        <label className={styles.aide}>Le numéro de châssis (VIN) correspond aux documents
          <select value={r.vinConforme} onChange={(e) => setR({ ...r, vinConforme: e.target.value })} style={champ}><option value="oui">Oui</option><option value="non">Non</option></select>
        </label>
        {RUBRIQUES_INSPECTION.map((x) => (
          <div key={x.code} style={{ display: "grid", gap: 6, gridTemplateColumns: "minmax(0,1fr)" }}>
            <span className={styles.aide}><strong>{x.libelle}</strong></span>
            <select value={points[x.code].etat} aria-label={x.libelle} onChange={(e) => setPoints({ ...points, [x.code]: { ...points[x.code], etat: e.target.value } })} style={champ}>
              {Object.entries(ETATS_RUBRIQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={points[x.code].note} aria-label={`Remarque — ${x.libelle}`} placeholder="Remarque (facultatif)" onChange={(e) => setPoints({ ...points, [x.code]: { ...points[x.code], note: e.target.value } })} style={champ} />
          </div>
        ))}
        <label className={styles.aide}>Synthèse pour l'acheteur
          <textarea value={r.synthese} onChange={(e) => setR({ ...r, synthese: e.target.value })} rows={5} required minLength={20} style={{ ...champ, minHeight: 120, padding: 10 }} />
        </label>
        <label className={styles.aide}>Verdict
          <select value={r.verdict} onChange={(e) => setR({ ...r, verdict: e.target.value })} required style={champ}>
            <option value="">Choisir…</option>
            {Object.entries(VERDICTS).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}
          </select>
        </label>
        <button type="submit" className={styles.bouton} disabled={occupe}>{occupe ? "Envoi…" : "Rendre le rapport"}</button>
      </form>
    </section>
  );
}

function Detail({ id }) {
  const api = useApi();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [etapesPermises, setEtapesPermises] = useState([]);
  const [docsPermis, setDocsPermis] = useState([]);
  const [erreur, setErreur] = useState("");
  const [etape, setEtape] = useState({ code: "", note: "" });
  const [occupe, setOccupe] = useState(false);

  const recevoir = (c) => { if (c.dossier) setD(c.dossier); if (c.etapes) setEtapesPermises(c.etapes); if (c.documents) setDocsPermis(c.documents); };
  useEffect(() => { api(`/api/transit/dossiers/${id}`).then(recevoir).catch((e) => setErreur(e.message)); }, [api, id]);

  const action = async (url, options) => {
    setOccupe(true); setErreur("");
    try { recevoir(await api(url, options)); return true; } catch (e) { setErreur(e.message); return false; } finally { setOccupe(false); }
  };

  if (!d) return <div className={styles.page}><p className={erreur ? styles.erreur : styles.attente}>{erreur || "Chargement…"}</p></div>;
  const rang = rangEtape(d.etape);
  const suivantes = ETAPES.filter((e) => etapesPermises.includes(e.code) && rangEtape(e.code) > rang);
  const exp = d.expedition || {};
  const majExp = (champ, valeur) => action(`/api/transit/dossiers/${id}/expedition`, { method: "PATCH", body: JSON.stringify({ [champ]: valeur }) });

  return (
    <div className={styles.page}>
      <Link to="/transit" className={styles.retour}>← Zone Transit</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{d.vehicule?.titre || "Véhicule"}</h1>
          <p className={styles.trajet}>{nomPays(d.origine?.pays)}{d.origine?.port ? ` (${d.origine.port})` : ""} → {nomPays(d.destination?.pays)}{d.destination?.port ? ` (${d.destination.port})` : ""}</p>
          {d.vehicule?.vin && <p className={styles.aide}>VIN : {d.vehicule.vin}</p>}
        </div>
        <span className={styles.reference}>{d.reference}</span>
      </div>
      <div className={styles.encart}>👤 Client : <strong>{d.client?.firstName} {d.client?.lastName}</strong>{d.client?.phone ? ` — ${d.client.phone}` : ""}</div>
      {erreur && <p className={styles.erreur}>{erreur}</p>}

      {d.inspection?.inspecteur && String(d.inspection.inspecteur) === String(user?.id || user?._id) && d.inspection.statut !== "non_demandee" && (
        <RapportInspection id={id} dossier={d} api={api} onDossier={setD} />
      )}

      <section className={styles.bloc}>
        <h2>Étape actuelle : {libelleEtape(d.etape)}</h2>
        {d.statut === "en_cours" && suivantes.length > 0 && (
          <form className={styles.formulaire} onSubmit={async (e) => { e.preventDefault(); if (await action(`/api/transit/dossiers/${id}/etape`, { method: "POST", body: JSON.stringify({ etape: etape.code, note: etape.note }) })) setEtape({ code: "", note: "" }); }}>
            <select value={etape.code} onChange={(e) => setEtape({ ...etape, code: e.target.value })} required aria-label="Étape suivante" style={{ minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px" }}>
              <option value="">Faire avancer à…</option>
              {suivantes.map((e) => <option key={e.code} value={e.code}>{e.libelle}</option>)}
            </select>
            <input value={etape.note} onChange={(e) => setEtape({ ...etape, note: e.target.value })} placeholder="Précision pour le client (facultatif)" aria-label="Précision pour le client" />
            <button type="submit" className={styles.bouton} disabled={occupe || !etape.code}>Enregistrer</button>
          </form>
        )}
        <p className={styles.aide}>Le client est prévenu à chaque étape enregistrée.</p>
      </section>

      <section className={styles.bloc}>
        <h2>Expédition</h2>
        <div className={styles.grille}>
          {[["compagnie", "Compagnie maritime"], ["navire", "Navire"], ["numeroBL", "N° connaissement"], ["numeroConteneur", "N° conteneur"]].map(([k, l]) => (
            <label key={k} className={styles.aide}>{l}
              <input defaultValue={exp[k] || ""} onBlur={(e) => e.target.value !== (exp[k] || "") && majExp(k, e.target.value)} style={{ display: "block", width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 16, boxSizing: "border-box" }} />
            </label>
          ))}
          <label className={styles.aide}>Arrivée prévue
            <input type="date" defaultValue={exp.arriveePrevueLe?.slice(0, 10) || ""} onBlur={(e) => majExp("arriveePrevueLe", e.target.value || null)} style={{ display: "block", width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 16, boxSizing: "border-box" }} />
          </label>
        </div>
      </section>

      <section className={styles.bloc}>
        <h2>Documents</h2>
        <ul className={styles.documents}>
          {(d.documents || []).filter((doc) => docsPermis.includes(doc.code)).map((doc) => (
            <li key={doc.code}>
              <span>{doc.libelle}</span>
              <span className={styles.statutDoc} style={{ color: STATUTS_DOCUMENT[doc.statut]?.couleur }}>{STATUTS_DOCUMENT[doc.statut]?.libelle}</span>
              {doc.url && <a href={doc.url} target="_blank" rel="noreferrer">Ouvrir</a>}
              {doc.statut !== "valide" && (
                <label className={styles.bouton} style={{ minHeight: 36 }}>Déposer
                  <input type="file" accept="application/pdf,image/*" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try { await action(`/api/transit/dossiers/${id}/documents/${doc.code}`, { method: "POST", body: JSON.stringify({ fichier: await lireFichier(f) }) }); }
                    catch (err) { setErreur(err.message); }
                    e.target.value = "";
                  }} />
                </label>
              )}
            </li>
          ))}
        </ul>
        <p className={styles.aide}>VIT AUTO vérifie et valide chaque document déposé.</p>
      </section>
    </div>
  );
}

export default function EspaceTransit() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user?.role !== "prestataire") {
    return <div className={styles.page}><p className={styles.erreur}>Cet espace est réservé aux prestataires de la zone Transit, inscrits sur invitation de VIT AUTO.</p></div>;
  }
  return id ? <Detail id={id} /> : <Liste />;
}
