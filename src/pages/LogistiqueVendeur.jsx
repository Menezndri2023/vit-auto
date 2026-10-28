import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BlocConditionsRoles, BlocEnlevement, BlocDocuments } from "./LogistiqueBlocs";
import styles from "./Logistique.module.css";
import { useLog } from "./logistiqueI18n";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace vendeur / exportateur (2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Les dossiers de transport rattachés à SES ventes (Trade ou Parts). Il
// confirme ce qui relève de lui — disponibilité, lieu d'enlèvement, poids,
// volume, chargement, documents — sans voir les prix du transport ni les
// coordonnées du client. Confirmer l'enlèvement ne fait pas de lui le
// donneur d'ordre ni le payeur.


function useApi() {
  const { token } = useAuth();
  const { t } = useLog();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.message || t("log.erreurReseau"));
    return corps;
  }, [token, t]);
}

function Liste() {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  useEffect(() => {
    api("/api/logistique/vendeur/demandes")
      .then((d) => setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api]);
  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>{t("log.v.titre")}</h1>
      <p className={styles.intro}>{t("log.v.intro")}</p>
      <p className={styles.encart}>{t("log.v.gratuit")} <Link to="/logistique">{t("log.v.organiser")}</Link></p>
      {etat.chargement && <p className={styles.attente}>{t("log.chargement")}</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <div className={styles.vide}><p>{t("log.v.aucun")}</p></div>}
      <div className={styles.grille}>
        {etat.demandes.map((d) => (
          <Link key={d._id} to={`/logistique/vendeur/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}>
              <strong>{L.type(d.typeBesoin)}</strong>
              <span className={styles.reference}>{d.reference}</span>
            </div>
            <p className={styles.trajet}>{d.depart?.ville} ({L.nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({L.nomPays(d.arrivee?.pays)})</p>
            <span className={styles.statut}>{L.statut(d.statut)}</span>
            <p className={styles.maj}>{d.enlevement?.confirmeLe ? t("log.v.enlevementLe", { date: L.fmtDate(d.enlevement.confirmeLe) }) : t("log.v.enlevementAConfirmer")}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

const VIDE = { disponible: true, dateDisponibilite: "", lieu: "", poidsKg: "", volumeM3: "", chargement: "", contraintesManutention: "", documentsPrevus: "" };

function Detail({ id }) {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [f, setF] = useState(VIDE);
  const [edition, setEdition] = useState(false);
  const base = `/api/logistique/vendeur/demandes/${id}`;

  useEffect(() => { api(base).then((r) => setD(r.demande)).catch((e) => setErreur(e.message)); }, [api, base]);

  if (erreur && !d) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/logistique/vendeur" className={styles.retour}>{t("log.v.retour")}</Link></div>;
  if (!d) return <div className={styles.page}><p className={styles.attente}>{t("log.chargement")}</p></div>;

  const modifiable = !["en_transport", "livraison_declaree", "cloturee", "annulee", "litige"].includes(d.statut);
  const ouvrir = () => {
    const e = d.enlevement || {};
    setF({ disponible: e.disponible ?? true, dateDisponibilite: e.dateDisponibilite ? String(e.dateDisponibilite).slice(0, 10) : "", lieu: e.lieu || "", poidsKg: e.poidsKg ?? "", volumeM3: e.volumeM3 ?? "", chargement: e.chargement || "", contraintesManutention: e.contraintesManutention || "", documentsPrevus: e.documentsPrevus || "" });
    setEdition(true);
  };
  const confirmer = async (e) => {
    e.preventDefault(); setErreur(""); setInfo("");
    try {
      const r = await api(`${base}/enlevement`, { method: "POST", body: JSON.stringify({ ...f, poidsKg: f.poidsKg === "" ? null : Number(f.poidsKg), volumeM3: f.volumeM3 === "" ? null : Number(f.volumeM3) }) });
      setD(r.demande); setEdition(false); setInfo(t("log.v.confirme"));
    } catch (err) { setErreur(err.message); }
  };
  const champ = (k, label, props = {}) => (
    <div className={styles.champ}><label htmlFor={`enl-${k}`}>{label}</label>
      <input id={`enl-${k}`} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} {...props} /></div>
  );

  return (
    <div className={styles.page}>
      <Link to="/logistique/vendeur" className={styles.retour}>{t("log.v.retour")}</Link>
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
        <h2>{t("log.v.leTransport")}</h2>
        <dl className={styles.infos}>
          {d.commandeLiee && <><dt>{t("log.commande")}</dt><dd>{L.libCommande(d.commandeLiee)}{d.commandeLiee.reference ? ` — ${d.commandeLiee.reference}` : ""}</dd></>}
          <dt>{t("log.modeSouhaite")}</dt><dd>{L.mode(d.modeSouhaite)}</dd>
          <dt>{t("log.dateSouhaitee")}</dt><dd>{L.fmtDate(d.dateSouhaitee)}</dd>
          <dt>{t("log.v.prestataireRetenu")}</dt><dd>{d.prestataireRetenu?.raisonSociale || t("log.v.pasChoisi")}</dd>
        </dl>
      </div>

      <BlocConditionsRoles demande={d} />

      {!edition && <BlocEnlevement enlevement={d.enlevement} />}
      {modifiable && !edition && <div className={styles.actions}><button type="button" className={styles.bouton} onClick={ouvrir}>{t(d.enlevement?.confirmeLe ? "log.v.majEnlevement" : "log.v.confirmerEnlevement")}</button></div>}
      {edition && (
        <form className={styles.bloc} onSubmit={confirmer}>
          <h2>{t("log.v.infosEnlevement")}</h2>
          <div className={styles.formGrille}>
            <div className={styles.champ}><label htmlFor="enl-dispo">{t("log.v.dispo")}</label>
              <select id="enl-dispo" value={f.disponible ? "oui" : "non"} onChange={(e) => setF((p) => ({ ...p, disponible: e.target.value === "oui" }))}>
                <option value="oui">{t("log.oui")}</option><option value="non">{t("log.v.pasEncore")}</option>
              </select></div>
            {champ("dateDisponibilite", t("log.v.dispoDu"), { type: "date" })}
            <div className={`${styles.champ} ${styles.pleine}`}><label htmlFor="enl-lieu">{t("log.v.lieu")}</label>
              <input id="enl-lieu" required value={f.lieu} onChange={(e) => setF((p) => ({ ...p, lieu: e.target.value }))} placeholder={t("log.v.lieuAide")} /></div>
            {champ("poidsKg", t("log.v.poidsKg"), { type: "number", inputMode: "decimal", min: "0" })}
            {champ("volumeM3", t("log.v.volumeM3"), { type: "number", inputMode: "decimal", min: "0", step: "0.01" })}
            {champ("chargement", t("log.v.chargement"))}
            {champ("contraintesManutention", t("log.v.manutention"))}
            {champ("documentsPrevus", t("log.v.documents"))}
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.bouton}>{t("log.confirmer")}</button>
            <button type="button" className={styles.boutonSec} onClick={() => setEdition(false)}>{t("log.annuler")}</button>
          </div>
        </form>
      )}

      <BlocDocuments documents={d.documents || []} role="vendeur"
        onDeposer={d.statut !== "annulee" ? async (corps) => {
          const r = await api(`${base}/documents`, { method: "POST", body: JSON.stringify(corps) });
          setD(r.demande); setInfo(t("log.documentDepose"));
        } : null} />
    </div>
  );
}

export default function LogistiqueVendeur() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!token) navigate("/login", { state: { from: { pathname: id ? `/logistique/vendeur/${id}` : "/logistique/vendeur" } } });
  }, [token, navigate, id]);
  if (!token) return null;
  return id ? <Detail id={id} /> : <Liste />;
}
