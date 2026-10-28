import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MODES_TRANSPORT, ETAPE_SUIVANTE_PRESTATAIRE } from "../constants/logistique";
import styles from "./Logistique.module.css";
import { BlocConditionsRoles, BlocEnlevement, BlocDocuments, EditeurPostes, PostesDevis } from "./LogistiqueBlocs";
import { useLog } from "./logistiqueI18n";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace prestataire (2026-10-27, traduit le 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Le prestataire ne voit que les demandes pour lesquelles VIT AUTO l'a
// sollicité, sans l'identité ni les coordonnées du client tant que son devis
// n'est pas accepté. Il répond, chiffre (chaque actualisation crée une
// nouvelle version), puis déclare lui-même les étapes d'exécution.

const enJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function useApi() {
  const { token } = useAuth();
  const { t } = useLog();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(corps.message || t("log.erreurReseau")), { champs: corps.champs || [] });
    return corps;
  }, [token, t]);
}

const lireFichier = (fichier, messageErreur) => new Promise((ok, ko) => {
  const lecteur = new FileReader();
  lecteur.onload = () => ok(lecteur.result);
  lecteur.onerror = () => ko(new Error(messageErreur));
  lecteur.readAsDataURL(fichier);
});

function Liste() {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  useEffect(() => {
    api("/api/logistique/prestataire/demandes")
      .then((d) => setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api]);

  return (
    <div className={styles.page}>
      <Link to="/transit" className={styles.retour}>{t("log.p.retourTransit")}</Link>
      <h1 className={styles.titre}>{t("log.p.titre")}</h1>
      <p className={styles.intro}>{t("log.p.intro")}</p>
      <p className={styles.encart}>{t("log.p.gratuit")}</p>
      {etat.chargement && <p className={styles.attente}>{t("log.chargement")}</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <div className={styles.vide}><p>{t("log.p.aucune")}</p></div>}
      <div className={styles.grille}>
        {etat.demandes.map((d) => (
          <Link key={d._id} to={`/transit/logistique/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}>
              <strong>{L.type(d.typeBesoin)}</strong>
              <span className={styles.reference}>{d.reference}</span>
            </div>
            <p className={styles.trajet}>{d.depart?.ville} ({L.nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({L.nomPays(d.arrivee?.pays)})</p>
            <span className={styles.statut}>{d.retenu ? t("log.p.retenu") : ""}{L.statut(d.statut)}</span>
            {d.sollicitation?.reponse === "en_attente" && <p className={styles.maj}>{t("log.p.attenteReponse")}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

const DEVIS_VIDE = { montant: "", devise: "EUR", delaiJoursMin: "", delaiJoursMax: "", valideJusquau: enJours(15), inclus: "", exclus: "", fraisAdditionnels: "", modalitesPaiement: "", conditionsAnnulation: "", nature: "estimatif", modeTransport: "", trajet: "", postes: [] };

function Detail({ id }) {
  const api = useApi();
  const L = useLog();
  const { t } = L;
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
      const donnees = await lireFichier(fichier, t("log.lectureImpossible"));
      await agir(`${base}/preuve`, { fichier: donnees, note }, t("log.p.preuveOk"));
    } catch (e) { setErreur(e.message); }
  };

  if (erreur && !d) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/transit/logistique" className={styles.retour}>{t("log.p.retour")}</Link></div>;
  if (!d) return <div className={styles.page}><p className={styles.attente}>{t("log.chargement")}</p></div>;

  const m = d.marchandise || {};
  const enCours = (d.mesDevis || []).filter((x) => x.statut === "propose").at(-1);
  const peutChiffrer = ["validee", "recherche_prestataires", "devis_recus"].includes(d.statut);
  const suivante = d.retenu ? ETAPE_SUIVANTE_PRESTATAIRE[d.statut] : null;
  const majDevis = (k, v) => setDevis((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.page}>
      <Link to="/transit/logistique" className={styles.retour}>{t("log.p.retour")}</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{L.type(d.typeBesoin)}</h1>
          <p className={styles.trajet}>{d.depart.ville} ({L.nomPays(d.depart.pays)}) → {d.arrivee.ville} ({L.nomPays(d.arrivee.pays)})</p>
          <span className={styles.statut}>{L.statut(d.statut)}</span>
        </div>
        <span className={styles.reference}>{d.reference}</span>
      </div>
      {info && <p className={styles.succes} role="status">{info}</p>}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}

      <div className={styles.bloc}>
        <h2>{t("log.p.besoin")}</h2>
        <dl className={styles.infos}>
          {d.typeBesoin === "vehicule"
            ? <><dt>{t("log.vehicule")}</dt><dd>{[m.vehicule?.marque, m.vehicule?.modele, m.vehicule?.annee].filter(Boolean).join(" ")}{m.vehicule?.roulant === false ? t("log.nonRoulant") : m.vehicule?.roulant ? t("log.roulant") : ""}</dd></>
            : <><dt>{t("log.marchandise")}</dt><dd>{m.description}</dd>
                <dt>{t("log.quantite")}</dt><dd>{m.quantite}</dd>
                {m.poidsKg != null && <><dt>{t("log.poids")}</dt><dd>{m.poidsKg} kg</dd></>}
                {(m.longueurCm || m.largeurCm || m.hauteurCm) && <><dt>{t("log.dimensions")}</dt><dd>{m.longueurCm || "?"} × {m.largeurCm || "?"} × {m.hauteurCm || "?"} cm</dd></>}</>}
          {d.commandeLiee && <><dt>{t("log.commandeLiee")}</dt><dd>{L.libCommande(d.commandeLiee)}</dd></>}
          <dt>{t("log.modeSouhaite")}</dt><dd>{L.mode(d.modeSouhaite)}</dd>
          <dt>{t("log.dateSouhaitee")}</dt><dd>{L.fmtDate(d.dateSouhaitee)}</dd>
          {m.contraintes && <><dt>{t("log.contraintes")}</dt><dd>{m.contraintes}</dd></>}
          {d.documentsDisponibles && <><dt>{t("log.documents")}</dt><dd>{d.documentsDisponibles}</dd></>}
          {d.retenu && d.contact && <><dt>{t("log.p.contactClient")}</dt><dd>{[d.contact.nom, d.contact.telephone, d.contact.email].filter(Boolean).join(" · ")}</dd></>}
        </dl>
        {!d.retenu && <p className={styles.maj}>{t("log.p.coordonneesApres")}</p>}
      </div>

      <BlocConditionsRoles demande={d} />
      {d.commandeLiee && <BlocEnlevement enlevement={d.enlevement} />}
      {d.retenu && (
        <BlocDocuments documents={d.documents || []} role="prestataire"
          onDeposer={d.statut !== "annulee" ? async (corps) => {
            const r = await api(`${base}/documents`, { method: "POST", body: JSON.stringify(corps) });
            setD(r.demande); setInfo(t("log.documentDepose"));
          } : null} />
      )}

      {peutChiffrer && d.sollicitation?.reponse !== "decline" && (
        <div className={styles.bloc}>
          <h2>{enCours ? t("log.p.actualiser", { v: enCours.version, montant: L.fmtMontant(enCours.montant, enCours.devise) }) : t("log.p.votreDevis")}</h2>
          <form onSubmit={(e) => { e.preventDefault(); agir(`${base}/devis`, devis, t(enCours ? "log.p.devisActualise" : "log.p.devisEnvoye")); }}>
            <div className={styles.formGrille}>
              <div className={styles.champ}><label htmlFor="dv-montant">{t("log.p.montant")}</label><input id="dv-montant" type="number" inputMode="decimal" min="0" step="0.01" required value={devis.montant} onChange={(e) => majDevis("montant", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-devise">{t("log.p.devise")}</label><input id="dv-devise" maxLength={3} required value={devis.devise} onChange={(e) => majDevis("devise", e.target.value.toUpperCase())} /></div>
              <div className={styles.champ}><label htmlFor="dv-min">{t("log.p.delaiMin")}</label><input id="dv-min" type="number" inputMode="numeric" min="0" value={devis.delaiJoursMin} onChange={(e) => majDevis("delaiJoursMin", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-max">{t("log.p.delaiMax")}</label><input id="dv-max" type="number" inputMode="numeric" min="0" value={devis.delaiJoursMax} onChange={(e) => majDevis("delaiJoursMax", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-validite">{t("log.p.validite")}</label><input id="dv-validite" type="date" required value={devis.valideJusquau} onChange={(e) => majDevis("valideJusquau", e.target.value)} /></div>
              <div className={styles.champ}><label htmlFor="dv-nature">{t("log.p.naturePrix")}</label>
                <select id="dv-nature" value={devis.nature} onChange={(e) => majDevis("nature", e.target.value)}>
                  <option value="estimatif">{t("log.p.estimation")}</option><option value="ferme">{t("log.prixFerme")}</option>
                </select></div>
              <div className={styles.champ}><label htmlFor="dv-mode">{t("log.p.modeTransport")}</label>
                <select id="dv-mode" value={devis.modeTransport} onChange={(e) => majDevis("modeTransport", e.target.value)}>
                  <option value="">{t("log.nonPrecise")}</option>
                  {MODES_TRANSPORT.filter((x) => x.code !== "indifferent").map((x) => <option key={x.code} value={x.code}>{L.mode(x.code)}</option>)}
                </select></div>
              <div className={`${styles.champ} ${styles.pleine}`}><label htmlFor="dv-trajet">{t("log.p.trajet")}</label><input id="dv-trajet" placeholder={t("log.p.trajetAide")} value={devis.trajet} onChange={(e) => majDevis("trajet", e.target.value)} /></div>
              <EditeurPostes valeur={devis.postes} onChange={(v) => majDevis("postes", v)} />
              {[["inclus", "log.p.inclus"], ["exclus", "log.p.exclus"], ["fraisAdditionnels", "log.p.frais"], ["modalitesPaiement", "log.p.paiement"], ["conditionsAnnulation", "log.p.annulation"]].map(([k, cle]) => (
                <div key={k} className={`${styles.champ} ${styles.pleine}`}><label htmlFor={`dv-${k}`}>{t(cle)}</label><textarea id={`dv-${k}`} value={devis[k]} onChange={(e) => majDevis(k, e.target.value)} /></div>
              ))}
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.bouton} disabled={occupe}>{t(enCours ? "log.p.envoyerVersion" : "log.p.envoyerDevis")}</button>
              {enCours && <button type="button" className={styles.boutonDanger} disabled={occupe} onClick={() => agir(`${base}/devis/${enCours._id}/retirer`, {}, t("log.p.devisRetire"))}>{t("log.p.retirerDevis")}</button>}
            </div>
          </form>
        </div>
      )}

      {peutChiffrer && !enCours && (
        <div className={styles.bloc}>
          <h2>{t("log.p.sansChiffrer")}</h2>
          <div className={styles.champ}><label htmlFor="sol-msg">{t("log.p.message")}</label><textarea id="sol-msg" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          <div className={styles.actions}>
            <button type="button" className={styles.boutonSec} disabled={occupe || !message.trim()} onClick={() => agir(`${base}/reponse`, { reponse: "precisions_demandees", message }, t("log.p.precisionsEnvoyees"))}>{t("log.p.demanderPrecisions")}</button>
            <button type="button" className={styles.boutonDanger} disabled={occupe} onClick={() => agir(`${base}/reponse`, { reponse: "decline", message }, t("log.p.decline"))}>{t("log.p.decliner")}</button>
          </div>
        </div>
      )}

      {suivante && (
        <div className={styles.bloc}>
          <h2>{t("log.p.avancement")}</h2>
          <p className={styles.intro}>{t("log.p.avancementAide")}</p>
          <div className={styles.formGrille}>
            <div className={styles.champ}><label htmlFor="et-note">{t("log.p.noteClient")}</label><input id="et-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {suivante.statut === "en_transport" && <div className={styles.champ}><label htmlFor="et-suivi">{t("log.p.refSuivi")}</label><input id="et-suivi" value={suivi} onChange={(e) => setSuivi(e.target.value)} /></div>}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe} onClick={() => agir(`${base}/etape`, { statut: suivante.statut, note, referenceSuivi: suivi || undefined }, t("log.p.etapeEnregistree", { etape: L.statut(suivante.statut) }))}>{t(`log.p.etape.${suivante.statut}`)}</button>
          </div>
        </div>
      )}

      {d.retenu && ["en_transport", "livraison_declaree", "litige"].includes(d.statut) && (
        <div className={styles.bloc}>
          <h2>{t("log.p.preuve")}</h2>
          {d.preuveLivraison?.deposeLe ? <p className={styles.succes}>{t("log.p.preuveDeposee", { date: L.fmtDate(d.preuveLivraison.deposeLe) })}</p> : <p className={styles.intro}>{t("log.p.preuveAide")}</p>}
          <div className={styles.champ}>
            <label htmlFor="preuve">{t("log.p.fichier")}</label>
            <input id="preuve" type="file" accept="image/*,application/pdf" disabled={occupe} onChange={(e) => envoyerPreuve(e.target.files?.[0])} />
          </div>
        </div>
      )}

      {(d.mesDevis || []).length > 0 && (
        <div className={styles.bloc}>
          <h2>{t("log.p.historique")}</h2>
          <ul className={styles.journal}>
            {d.mesDevis.map((x) => (
              <li key={x._id}>
                {t("log.p.ligneHisto", { v: x.version, montant: L.fmtMontant(x.montant, x.devise), nature: t(x.nature === "ferme" ? "log.p.ferme" : "log.p.estim"), statut: L.devis(x.statut), date: L.fmtDate(x.creeLe) })}
                <PostesDevis devis={x} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function LogistiquePrestataire() {
  const { id } = useParams();
  const { user, token, authReady } = useAuth();
  const { t } = useLog();
  if (!authReady && token) return null;
  if (!token) return <Navigate to="/login" replace state={{ from: { pathname: id ? `/transit/logistique/${id}` : "/transit/logistique" } }} />;
  if (user && user.role !== "prestataire") return <div className={styles.page}><p className={styles.erreur}>{t("log.p.reserve")}</p></div>;
  return id ? <Detail id={id} /> : <Liste />;
}
