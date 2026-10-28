import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TYPES_BESOIN, LIBELLES_STATUT, MODES_TRANSPORT, nomPays } from "../constants/logistique";
import { BlocConditionsRoles, BlocEnlevement, BlocDocuments } from "./LogistiqueBlocs";
import styles from "./Logistique.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace vendeur / exportateur (2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Les dossiers de transport rattachés à SES ventes (Trade ou Parts). Il
// confirme ce qui relève de lui — disponibilité, lieu d'enlèvement, poids,
// volume, chargement, documents — sans voir les prix du transport ni les
// coordonnées du client. Confirmer l'enlèvement ne fait pas de lui le
// donneur d'ordre ni le payeur.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

function useApi() {
  const { token } = useAuth();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.message || "Erreur réseau.");
    return corps;
  }, [token]);
}

function Liste() {
  const api = useApi();
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  useEffect(() => {
    api("/api/logistique/vendeur/demandes")
      .then((d) => setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }))
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api]);
  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>📦 Transports de mes ventes</h1>
      <p className={styles.intro}>Les dossiers logistiques rattachés à vos commandes VIT-AUTO Trade ou Parts. Confirmez l'enlèvement et déposez les documents qui relèvent de vous.</p>
      <p className={styles.encart}>Mise en relation gratuite : VIT AUTO ne prélève rien sur le transport. <Link to="/logistique">Organiser vous-même un transport</Link></p>
      {etat.chargement && <p className={styles.attente}>Chargement…</p>}
      {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
      {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <div className={styles.vide}><p>Aucun transport rattaché à vos ventes pour l'instant.</p></div>}
      <div className={styles.grille}>
        {etat.demandes.map((d) => (
          <Link key={d._id} to={`/logistique/vendeur/${d._id}`} className={styles.carte}>
            <div className={styles.carteEntete}>
              <strong>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</strong>
              <span className={styles.reference}>{d.reference}</span>
            </div>
            <p className={styles.trajet}>{d.depart?.ville} ({nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({nomPays(d.arrivee?.pays)})</p>
            <span className={styles.statut}>{LIBELLES_STATUT[d.statut]}</span>
            <p className={styles.maj}>{d.enlevement?.confirmeLe ? `Enlèvement confirmé le ${fmtDate(d.enlevement.confirmeLe)}` : "Enlèvement à confirmer"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

const VIDE = { disponible: true, dateDisponibilite: "", lieu: "", poidsKg: "", volumeM3: "", chargement: "", contraintesManutention: "", documentsPrevus: "" };

function Detail({ id }) {
  const api = useApi();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [f, setF] = useState(VIDE);
  const [edition, setEdition] = useState(false);
  const base = `/api/logistique/vendeur/demandes/${id}`;

  useEffect(() => { api(base).then((r) => setD(r.demande)).catch((e) => setErreur(e.message)); }, [api, base]);

  if (erreur && !d) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/logistique/vendeur" className={styles.retour}>← Transports de mes ventes</Link></div>;
  if (!d) return <div className={styles.page}><p className={styles.attente}>Chargement…</p></div>;

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
      setD(r.demande); setEdition(false); setInfo("Informations d'enlèvement confirmées : le demandeur et le prestataire retenu sont prévenus.");
    } catch (err) { setErreur(err.message); }
  };
  const champ = (k, label, props = {}) => (
    <div className={styles.champ}><label htmlFor={`enl-${k}`}>{label}</label>
      <input id={`enl-${k}`} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} {...props} /></div>
  );

  return (
    <div className={styles.page}>
      <Link to="/logistique/vendeur" className={styles.retour}>← Transports de mes ventes</Link>
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
        <h2>Le transport</h2>
        <dl className={styles.infos}>
          {d.commandeLiee && <><dt>Commande</dt><dd>{d.commandeLiee.libelle}{d.commandeLiee.reference ? ` — ${d.commandeLiee.reference}` : ""}</dd></>}
          <dt>Mode souhaité</dt><dd>{MODES_TRANSPORT.find((x) => x.code === d.modeSouhaite)?.libelle}</dd>
          <dt>Date souhaitée</dt><dd>{fmtDate(d.dateSouhaitee)}</dd>
          <dt>Prestataire retenu</dt><dd>{d.prestataireRetenu?.raisonSociale || "Pas encore choisi"}</dd>
        </dl>
      </div>

      <BlocConditionsRoles demande={d} />

      {!edition && <BlocEnlevement enlevement={d.enlevement} />}
      {modifiable && !edition && <div className={styles.actions}><button type="button" className={styles.bouton} onClick={ouvrir}>{d.enlevement?.confirmeLe ? "Mettre à jour l'enlèvement" : "Confirmer l'enlèvement"}</button></div>}
      {edition && (
        <form className={styles.bloc} onSubmit={confirmer}>
          <h2>Informations d'enlèvement</h2>
          <div className={styles.formGrille}>
            <div className={styles.champ}><label htmlFor="enl-dispo">Marchandise disponible ?</label>
              <select id="enl-dispo" value={f.disponible ? "oui" : "non"} onChange={(e) => setF((p) => ({ ...p, disponible: e.target.value === "oui" }))}>
                <option value="oui">Oui</option><option value="non">Pas encore</option>
              </select></div>
            {champ("dateDisponibilite", "Disponible à partir du", { type: "date" })}
            <div className={`${styles.champ} ${styles.pleine}`}><label htmlFor="enl-lieu">Lieu d'enlèvement</label>
              <input id="enl-lieu" required value={f.lieu} onChange={(e) => setF((p) => ({ ...p, lieu: e.target.value }))} placeholder="Adresse, entrepôt, terminal…" /></div>
            {champ("poidsKg", "Poids (kg)", { type: "number", inputMode: "decimal", min: "0" })}
            {champ("volumeM3", "Volume (m³)", { type: "number", inputMode: "decimal", min: "0", step: "0.01" })}
            {champ("chargement", "Caractéristiques du chargement")}
            {champ("contraintesManutention", "Contraintes de manutention")}
            {champ("documentsPrevus", "Documents que vous fournirez")}
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.bouton}>Confirmer</button>
            <button type="button" className={styles.boutonSec} onClick={() => setEdition(false)}>Annuler</button>
          </div>
        </form>
      )}

      <BlocDocuments documents={d.documents || []} role="vendeur"
        onDeposer={d.statut !== "annulee" ? async (corps) => {
          const r = await api(`${base}/documents`, { method: "POST", body: JSON.stringify(corps) });
          setD(r.demande); setInfo("Document déposé.");
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
