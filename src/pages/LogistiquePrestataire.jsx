import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TYPES_BESOIN, MODES_TRANSPORT, LIBELLES_STATUT, LIBELLES_DEVIS, ETAPE_SUIVANTE_PRESTATAIRE, nomPays } from "../constants/logistique";
import styles from "./Logistique.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace prestataire (2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Le prestataire ne voit que les demandes pour lesquelles VIT AUTO l'a
// sollicité, sans l'identité ni les coordonnées du client tant que son devis
// n'est pas accepté. Il répond, chiffre (chaque actualisation crée une
// nouvelle version), puis déclare lui-même les étapes d'exécution.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtMontant = (n, devise) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise || ""}`.trim());
const enJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function useApi() {
  const { token } = useAuth();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(corps.message || "Erreur réseau."), { champs: corps.champs || [] });
    return corps;
  }, [token]);
}

const lireFichier = (fichier) => new Promise((ok, ko) => {
  const lecteur = new FileReader();
  lecteur.onload = () => ok(lecteur.result);
  lecteur.onerror = () => ko(new Error("Lecture du fichier impossible."));
  lecteur.readAsDataURL(fichier);
});

function Liste() {
  const api = useApi();
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  useEffect(() => {
    api("/api/logistique/prestataire/demandes")
      .then((d) => setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api]);

  return (
    <div className={styles.page}>
      <Link to="/transit" className={styles.retour}>← Zone Transit</Link>
      <h1 className={styles.titre}>📦 Demandes logistiques</h1>
      <p className={styles.intro}>Les demandes de transport pour lesquelles VIT AUTO vous consulte. Répondez, chiffrez, puis déclarez l'avancement si votre devis est retenu.</p>
      <p className={styles.encart}>Mise en relation gratuite : VIT AUTO ne prélève aucune commission. Le client vous règle directement, selon les conditions de votre devis.</p>
      {etat.chargement && <p className={styles.attente}>Chargement…</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <div className={styles.vide}><p>Aucune demande pour l'instant.</p></div>}
      <div className={styles.grille}>
        {etat.demandes.map((d) => (
          <Link key={d._id} to={`/transit/logistique/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}>
              <strong>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</strong>
              <span className={styles.reference}>{d.reference}</span>
            </div>
            <p className={styles.trajet}>{d.depart?.ville} ({nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({nomPays(d.arrivee?.pays)})</p>
            <span className={styles.statut}>{d.retenu ? "✅ Votre devis est retenu — " : ""}{LIBELLES_STATUT[d.statut]}</span>
            {d.sollicitation?.reponse === "en_attente" && <p className={styles.maj}>En attente de votre réponse</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

const DEVIS_VIDE = { montant: "", devise: "EUR", delaiJoursMin: "", delaiJoursMax: "", valideJusquau: enJours(15), inclus: "", exclus: "", fraisAdditionnels: "", modalitesPaiement: "", conditionsAnnulation: "" };

function Detail({ id }) {
  const api = useApi();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState("");
  const [devis, setDevis] = useState(DEVIS_VIDE);
  const [note, setNote] = useState("");
  const [suivi, setSuivi] = useState("");
  const base = `/api/logistique/prestataire/demandes/${id}`;

  const charger = useCallback(() => {
    api(base).then((r) => setD(r.demande)).catch((e) => setErreur(e.message));
  }, [api, base]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (url, corps, msg) => {
    setOccupe(true); setErreur(""); setInfo("");
    try {
      const r = await api(url, { method: "POST", body: JSON.stringify(corps || {}) });
      setD(r.demande); setInfo(msg); setMessage(""); setNote(""); setSuivi("");
    } catch (e) {
      setErreur(e.champs?.length ? `${e.message} (${e.champs.join(", ")})` : e.message);
    } finally { setOccupe(false); }
  };

  const envoyerPreuve = async (fichier) => {
    if (!fichier) return;
    try {
      const donnees = await lireFichier(fichier);
      await agir(`${base}/preuve`, { fichier: donnees, note }, "Preuve de livraison déposée.");
    } catch (e) { setErreur(e.message); }
  };

  if (erreur && !d) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/transit/logistique" className={styles.retour}>← Demandes</Link></div>;
  if (!d) return <div className={styles.page}><p className={styles.attente}>Chargement…</p></div>;

  const m = d.marchandise || {};
  const enCours = (d.mesDevis || []).filter((x) => x.statut === "propose").at(-1);
  const peutChiffrer = ["validee", "recherche_prestataires", "devis_recus"].includes(d.statut);
  const suivante = d.retenu ? ETAPE_SUIVANTE_PRESTATAIRE[d.statut] : null;
  const majDevis = (k, v) => setDevis((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.page}>
      <Link to="/transit/logistique" className={styles.retour}>← Demandes</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</h1>
          <p className={styles.trajet}>{d.depart.ville} ({nomPays(d.depart.pays)}) → {d.arrivee.ville} ({nomPays(d.arrivee.pays)})</p>
          <span className={styles.statut}>{LIBELLES_STATUT[d.statut]}</span>
        </div>
        <span className={styles.reference}>{d.reference}</span>
      </div>
      {info && <p className={styles.succes} role="status">{info}</p>}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}

      <div className={styles.bloc}>
        <h2>Le besoin</h2>
        <dl className={styles.infos}>
          {d.typeBesoin === "vehicule"
            ? <><dt>Véhicule</dt><dd>{[m.vehicule?.marque, m.vehicule?.modele, m.vehicule?.annee].filter(Boolean).join(" ")}{m.vehicule?.roulant === false ? " — non roulant" : m.vehicule?.roulant ? " — roulant" : ""}</dd></>
            : <><dt>Marchandise</dt><dd>{m.description}</dd>
                <dt>Quantité</dt><dd>{m.quantite}</dd>
                {m.poidsKg != null && <><dt>Poids</dt><dd>{m.poidsKg} kg</dd></>}
                {(m.longueurCm || m.largeurCm || m.hauteurCm) && <><dt>Dimensions</dt><dd>{m.longueurCm || "?"} × {m.largeurCm || "?"} × {m.hauteurCm || "?"} cm</dd></>}</>}
          <dt>Mode souhaité</dt><dd>{MODES_TRANSPORT.find((x) => x.code === d.modeSouhaite)?.libelle}</dd>
          <dt>Date souhaitée</dt><dd>{fmtDate(d.dateSouhaitee)}</dd>
          {m.contraintes && <><dt>Contraintes</dt><dd>{m.contraintes}</dd></>}
          {d.documentsDisponibles && <><dt>Documents</dt><dd>{d.documentsDisponibles}</dd></>}
          {d.retenu && d.contact && <><dt>Contact client</dt><dd>{[d.contact.nom, d.contact.telephone, d.contact.email].filter(Boolean).join(" · ")}</dd></>}
        </dl>
        {!d.retenu && <p className={styles.maj}>Les coordonnées du client vous seront communiquées si votre devis est accepté.</p>}
      </div>

      {peutChiffrer && d.sollicitation?.reponse !== "decline" && (
        <div className={styles.bloc}>
          <h2>{enCours ? `Actualiser votre devis (version ${enCours.version} en cours : ${fmtMontant(enCours.montant, enCours.devise)})` : "Votre devis"}</h2>
          <form onSubmit={(e) => { e.preventDefault(); agir(`${base}/devis`, devis, enCours ? "Devis actualisé : nouvelle version envoyée au client." : "Devis envoyé au client."); }}>
            <div className={styles.formGrille}>
              <div className={styles.champ}><label htmlFor="dv-montant">Montant</label><input id="dv-montant" type="number" inputMode="decimal" min="0" step="0.01" required value={devis.montant} onChange={(e) => majDevis("montant", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-devise">Devise (code ISO)</label><input id="dv-devise" maxLength={3} required value={devis.devise} onChange={(e) => majDevis("devise", e.target.value.toUpperCase())} /></div>
              <div className={styles.champ}><label htmlFor="dv-min">Délai minimum (jours)</label><input id="dv-min" type="number" inputMode="numeric" min="0" value={devis.delaiJoursMin} onChange={(e) => majDevis("delaiJoursMin", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-max">Délai maximum (jours)</label><input id="dv-max" type="number" inputMode="numeric" min="0" value={devis.delaiJoursMax} onChange={(e) => majDevis("delaiJoursMax", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-validite">Valable jusqu'au</label><input id="dv-validite" type="date" required value={devis.valideJusquau} onChange={(e) => majDevis("valideJusquau", e.target.value)} /></div>
              {[["inclus", "Prestations incluses"], ["exclus", "Prestations exclues"], ["fraisAdditionnels", "Frais additionnels éventuels et conditions"], ["modalitesPaiement", "Modalités de paiement"], ["conditionsAnnulation", "Conditions d'annulation et exclusions"]].map(([k, l]) => (
                <div key={k} className={`${styles.champ} ${styles.pleine}`}><label htmlFor={`dv-${k}`}>{l}</label><textarea id={`dv-${k}`} value={devis[k]} onChange={(e) => majDevis(k, e.target.value)} /></div>
              ))}
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.bouton} disabled={occupe}>{enCours ? "Envoyer la nouvelle version" : "Envoyer le devis"}</button>
              {enCours && <button type="button" className={styles.boutonDanger} disabled={occupe} onClick={() => agir(`${base}/devis/${enCours._id}/retirer`, {}, "Devis retiré.")}>Retirer mon devis</button>}
            </div>
          </form>
        </div>
      )}

      {peutChiffrer && !enCours && (
        <div className={styles.bloc}>
          <h2>Ou répondre sans chiffrer</h2>
          <div className={styles.champ}><label htmlFor="sol-msg">Message à VIT AUTO</label><textarea id="sol-msg" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          <div className={styles.actions}>
            <button type="button" className={styles.boutonSec} disabled={occupe || !message.trim()} onClick={() => agir(`${base}/reponse`, { reponse: "precisions_demandees", message }, "Demande de précisions transmise à VIT AUTO.")}>Demander des précisions</button>
            <button type="button" className={styles.boutonDanger} disabled={occupe} onClick={() => agir(`${base}/reponse`, { reponse: "decline", message }, "Vous avez décliné cette demande.")}>Décliner</button>
          </div>
        </div>
      )}

      {suivante && (
        <div className={styles.bloc}>
          <h2>Avancement de l'opération</h2>
          <p className={styles.intro}>Déclarez chaque étape quand elle a réellement eu lieu : le client est prévenu à chaque fois.</p>
          <div className={styles.formGrille}>
            <div className={styles.champ}><label htmlFor="et-note">Note pour le client (facultatif)</label><input id="et-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {suivante.statut === "en_transport" && <div className={styles.champ}><label htmlFor="et-suivi">Référence de suivi (conteneur, LTA, CMR…)</label><input id="et-suivi" value={suivi} onChange={(e) => setSuivi(e.target.value)} /></div>}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe} onClick={() => agir(`${base}/etape`, { statut: suivante.statut, note, referenceSuivi: suivi || undefined }, `Étape enregistrée : ${LIBELLES_STATUT[suivante.statut]}.`)}>{suivante.libelle}</button>
          </div>
        </div>
      )}

      {d.retenu && ["en_transport", "livraison_declaree", "litige"].includes(d.statut) && (
        <div className={styles.bloc}>
          <h2>Preuve de livraison</h2>
          {d.preuveLivraison?.deposeLe ? <p className={styles.succes}>Déposée le {fmtDate(d.preuveLivraison.deposeLe)}.</p> : <p className={styles.intro}>Bon de livraison signé, photo à la remise… (image ou PDF, 8 Mo maximum).</p>}
          <div className={styles.champ}>
            <label htmlFor="preuve">Fichier</label>
            <input id="preuve" type="file" accept="image/*,application/pdf" disabled={occupe} onChange={(e) => envoyerPreuve(e.target.files?.[0])} />
          </div>
        </div>
      )}

      {(d.mesDevis || []).length > 0 && (
        <div className={styles.bloc}>
          <h2>Historique de vos devis</h2>
          <ul className={styles.journal}>
            {d.mesDevis.map((x) => <li key={x._id}>Version {x.version} — {fmtMontant(x.montant, x.devise)} — {LIBELLES_DEVIS[x.statut]} — {fmtDate(x.creeLe)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function LogistiquePrestataire() {
  const { id } = useParams();
  const { user, token, authReady } = useAuth();
  if (!authReady && token) return null;
  if (!token) return <Navigate to="/login" replace state={{ from: { pathname: id ? `/transit/logistique/${id}` : "/transit/logistique" } }} />;
  if (user && user.role !== "prestataire") return <div className={styles.page}><p className={styles.erreur}>Espace réservé aux prestataires logistiques invités par VIT AUTO.</p></div>;
  return id ? <Detail id={id} /> : <Liste />;
}
