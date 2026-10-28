import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { TYPES_BESOIN, MODES_TRANSPORT, FRISE, ANNULABLE_PAR_CLIENT, LITIGE_OUVRABLE, PAYS } from "../constants/logistique";
import styles from "./Logistique.module.css";
import { BlocConditionsRoles, BlocEnlevement, BlocDocuments, PostesDevis } from "./LogistiqueBlocs";
import { useLog } from "./logistiqueI18n";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace client (2026-10-27, traduit le 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Mise en relation GRATUITE : le client décrit son besoin, VIT AUTO sollicite
// des transporteurs et transitaires partenaires, le client compare les devis
// et règle le prestataire retenu directement, selon ses conditions. VIT AUTO
// n'est ni transporteur ni transitaire et ne prélève rien. Textes :
// src/i18n/logistique.js.

function useApi() {
  const { token } = useAuth();
  const { t } = useLog();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(corps.message || t("log.erreurReseau")), { champs: corps.champs || [], code: corps.code, demandeId: corps.demandeId });
    return corps;
  }, [token, t]);
}

const classeStatut = (s) => (["annulee", "litige", "infos_requises"].includes(s) ? `${styles.statut} ${styles.statutAlerte}` : s === "cloturee" ? `${styles.statut} ${styles.statutFin}` : styles.statut);

// ── Formulaire ──────────────────────────────────────────────────────────────
const VIDE = {
  typeBesoin: "vehicule", depart: { pays: "", ville: "" }, arrivee: { pays: "", ville: "" }, modeSouhaite: "indifferent",
  marchandise: { description: "", quantite: 1, poidsKg: "", longueurCm: "", largeurCm: "", hauteurCm: "", contraintes: "", vehicule: { marque: "", modele: "", annee: "", roulant: true } },
  dateSouhaitee: "", documentsDisponibles: "", contact: { telephone: "", email: "" },
};

function Champ({ id, label, erreur, aide, children }) {
  return (
    <div className={styles.champ}>
      <label htmlFor={id}>{label}</label>
      {children}
      {aide && <span className={styles.aideChamp} id={`${id}-aide`}>{aide}</span>}
      {erreur && <span className={styles.erreurChamp} role="alert">{erreur}</span>}
    </div>
  );
}

// Préremplit le formulaire depuis une commande : seuls les champs connus de la
// commande sont écrasés, le client peut ensuite tout corriger.
function appliquerPrefill(base, prefill = {}) {
  const f = structuredClone(base);
  if (prefill.typeBesoin) f.typeBesoin = prefill.typeBesoin;
  for (const cote of ["depart", "arrivee"]) {
    if (prefill[cote]?.pays) f[cote].pays = prefill[cote].pays;
    if (prefill[cote]?.ville) f[cote].ville = prefill[cote].ville;
  }
  const m = prefill.marchandise || {};
  if (m.description) f.marchandise.description = m.description;
  if (m.quantite) f.marchandise.quantite = m.quantite;
  if (m.vehicule) {
    for (const k of ["marque", "modele", "annee"]) if (m.vehicule[k]) f.marchandise.vehicule[k] = m.vehicule[k];
  }
  return f;
}

function Formulaire({ onCree, lienInitial }) {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const [f, setF] = useState(VIDE);
  const [commandes, setCommandes] = useState([]);
  const [lien, setLien] = useState("");
  // Une clé par formulaire : un double clic ou un envoi rejoué ne crée pas un
  // second dossier (le serveur renvoie le premier).
  const [cleIdempotence] = useState(() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));

  const choisirCommande = useCallback((valeur, liste) => {
    setLien(valeur);
    const c = liste.find((x) => `${x.type}:${x.id}` === valeur);
    if (c) setF((p) => appliquerPrefill(p, c.prefill));
  }, []);

  useEffect(() => {
    api("/api/logistique/commandes-rattachables")
      .then((r) => {
        const liste = r.commandes || [];
        setCommandes(liste);
        if (lienInitial && liste.some((c) => `${c.type}:${c.id}` === lienInitial)) choisirCommande(lienInitial, liste);
      })
      .catch(() => setCommandes([]));
  }, [api, lienInitial, choisirCommande]);
  const commandeChoisie = commandes.find((c) => `${c.type}:${c.id}` === lien);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [manquants, setManquants] = useState([]);
  const maj = (chemin, valeur) => setF((p) => {
    const copie = structuredClone(p);
    const cles = chemin.split(".");
    let o = copie;
    for (const k of cles.slice(0, -1)) o = o[k];
    o[cles.at(-1)] = valeur;
    return copie;
  });
  const invalide = (c) => manquants.includes(c) || undefined;
  const msg = (c) => (manquants.includes(c) ? t("log.champRequis") : null);

  const envoyer = async (brouillon) => {
    setEnvoi(true); setErreur(""); setManquants([]);
    try {
      const v = f.marchandise.vehicule;
      const [lienType, lienId] = lien ? lien.split(":") : [];
      const corps = {
        ...f, brouillon, cleIdempotence,
        ...(lien ? { lien: { type: lienType, id: lienId } } : {}),
        marchandise: { ...f.marchandise, vehicule: f.typeBesoin === "vehicule" ? { ...v, annee: v.annee || null } : undefined },
      };
      const r = await api("/api/logistique/demandes", { method: "POST", body: JSON.stringify(corps) });
      onCree(r.demande);
    } catch (e) {
      setErreur(e.champs?.length ? t("log.aCompleter", { champs: e.champs.map((c) => t(`log.champ.${c}`)).join(", ") }) : e.message);
      setManquants(e.champs || []);
    } finally { setEnvoi(false); }
  };

  const pays = (id, valeur, chemin, label) => (
    <Champ id={id} label={label} erreur={msg(chemin)}>
      <select id={id} value={valeur} aria-invalid={invalide(chemin)} onChange={(e) => maj(chemin, e.target.value)}>
        <option value="">{t("log.choisir")}</option>
        {PAYS.map((p) => <option key={p.code} value={p.code}>{p.flag} {L.nomPays(p.code)}</option>)}
      </select>
    </Champ>
  );

  return (
    <form className={styles.bloc} onSubmit={(e) => { e.preventDefault(); envoyer(false); }} noValidate>
      <h2>{t("log.nouvelleDemande")}</h2>
      {commandes.length > 0 && (
        <div className={styles.champ} style={{ marginBottom: 14 }}>
          <label htmlFor="log-commande">{t("log.rattacher")}</label>
          <select id="log-commande" value={lien} onChange={(e) => choisirCommande(e.target.value, commandes)}>
            <option value="">{t("log.aucuneCommande")}</option>
            {commandes.map((c) => (
              <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
                {t(c.role === "vendeur" ? "log.vente" : "log.achat")}{c.libelle}{c.reference ? ` (${c.reference})` : ""}{c.dossiersLogistiques?.length ? t("log.dossiersOuverts", { n: c.dossiersLogistiques.length }) : ""}
              </option>
            ))}
          </select>
          <span className={styles.aideChamp}>{t(commandeChoisie ? "log.aidePrerempli" : "log.aideCommande")}</span>
          {commandeChoisie?.incoterm?.libelle && (
            <span className={styles.aideChamp}>{t("log.incotermCommandeAide", { libelle: commandeChoisie.incoterm.libelle, etat: commandeChoisie.incoterm.statut === "accepte" ? "" : t("log.proposeNonAccepte") })}</span>
          )}
        </div>
      )}
      <div className={styles.choixType} role="group" aria-label={t("log.typeBesoin")}>
        {TYPES_BESOIN.map((x) => (
          <button key={x.code} type="button" className={styles.choix} aria-pressed={f.typeBesoin === x.code} onClick={() => maj("typeBesoin", x.code)}>
            <span aria-hidden="true">{x.icone}</span>{L.type(x.code)}
          </button>
        ))}
      </div>

      <div className={styles.formGrille}>
        {pays("log-dep-pays", f.depart.pays, "depart.pays", t("log.paysDepart"))}
        <Champ id="log-dep-ville" label={t("log.villeDepart")} erreur={msg("depart.ville")}>
          <input id="log-dep-ville" value={f.depart.ville} aria-invalid={invalide("depart.ville")} onChange={(e) => maj("depart.ville", e.target.value)} autoComplete="address-level2" />
        </Champ>
        {pays("log-arr-pays", f.arrivee.pays, "arrivee.pays", t("log.paysArrivee"))}
        <Champ id="log-arr-ville" label={t("log.villeArrivee")} erreur={msg("arrivee.ville")}>
          <input id="log-arr-ville" value={f.arrivee.ville} aria-invalid={invalide("arrivee.ville")} onChange={(e) => maj("arrivee.ville", e.target.value)} />
        </Champ>

        {f.typeBesoin === "vehicule" ? (
          <>
            <Champ id="log-marque" label={t("log.marque")} erreur={msg("marchandise.vehicule.marque")}>
              <input id="log-marque" value={f.marchandise.vehicule.marque} aria-invalid={invalide("marchandise.vehicule.marque")} onChange={(e) => maj("marchandise.vehicule.marque", e.target.value)} />
            </Champ>
            <Champ id="log-modele" label={t("log.modele")} erreur={msg("marchandise.vehicule.modele")}>
              <input id="log-modele" value={f.marchandise.vehicule.modele} aria-invalid={invalide("marchandise.vehicule.modele")} onChange={(e) => maj("marchandise.vehicule.modele", e.target.value)} />
            </Champ>
            <Champ id="log-annee" label={t("log.anneeFac")}>
              <input id="log-annee" type="number" inputMode="numeric" min="1900" max="2100" value={f.marchandise.vehicule.annee} onChange={(e) => maj("marchandise.vehicule.annee", e.target.value)} />
            </Champ>
            <div className={styles.champ}>
              <span className={styles.legende}>{t("log.etat")}</span>
              <label className={styles.caseLigne}>
                <input type="checkbox" checked={f.marchandise.vehicule.roulant === true} onChange={(e) => maj("marchandise.vehicule.roulant", e.target.checked)} />
                {t("log.vehiculeRoule")}
              </label>
            </div>
          </>
        ) : (
          <>
            <div className={styles.pleine}>
              <Champ id="log-desc" label={t("log.natureMarchandise")} erreur={msg("marchandise.description")} aide={t("log.natureAide")}>
                <textarea id="log-desc" value={f.marchandise.description} aria-invalid={invalide("marchandise.description")} onChange={(e) => maj("marchandise.description", e.target.value)} />
              </Champ>
            </div>
            <Champ id="log-qte" label={t("log.quantiteColis")}>
              <input id="log-qte" type="number" inputMode="numeric" min="1" value={f.marchandise.quantite} onChange={(e) => maj("marchandise.quantite", e.target.value)} />
            </Champ>
            <Champ id="log-poids" label={t("log.poidsFac")}>
              <input id="log-poids" type="number" inputMode="decimal" min="0" value={f.marchandise.poidsKg} onChange={(e) => maj("marchandise.poidsKg", e.target.value)} />
            </Champ>
            <Champ id="log-dim" label={t("log.dimFac")}>
              <div style={{ display: "flex", gap: 6 }}>
                {["longueurCm", "largeurCm", "hauteurCm"].map((k, i) => (
                  <input key={k} aria-label={t(["log.longueur", "log.largeur", "log.hauteur"][i])} type="number" inputMode="decimal" min="0" value={f.marchandise[k]} onChange={(e) => maj(`marchandise.${k}`, e.target.value)} />
                ))}
              </div>
            </Champ>
          </>
        )}

        <Champ id="log-mode" label={t("log.modeTransportSouhaite")}>
          <select id="log-mode" value={f.modeSouhaite} onChange={(e) => maj("modeSouhaite", e.target.value)}>
            {MODES_TRANSPORT.map((m) => <option key={m.code} value={m.code}>{L.mode(m.code)}</option>)}
          </select>
        </Champ>
        <Champ id="log-date" label={t("log.dateFac")}>
          <input id="log-date" type="date" value={f.dateSouhaitee} onChange={(e) => maj("dateSouhaitee", e.target.value)} />
        </Champ>
        <div className={styles.pleine}>
          <Champ id="log-contraintes" label={t("log.contraintesFac")} aide={t("log.contraintesAide")}>
            <textarea id="log-contraintes" value={f.marchandise.contraintes} onChange={(e) => maj("marchandise.contraintes", e.target.value)} />
          </Champ>
        </div>
        <div className={styles.pleine}>
          <Champ id="log-docs" label={t("log.docsFac")} aide={t("log.docsAide")}>
            <input id="log-docs" value={f.documentsDisponibles} onChange={(e) => maj("documentsDisponibles", e.target.value)} />
          </Champ>
        </div>
        <Champ id="log-tel" label={t("log.telContact")} erreur={msg("contact")} aide={t("log.telAide")}>
          <input id="log-tel" type="tel" autoComplete="tel" value={f.contact.telephone} aria-invalid={invalide("contact")} onChange={(e) => maj("contact.telephone", e.target.value)} />
        </Champ>
        <Champ id="log-mail" label={t("log.mailContact")} aide={t("log.mailAide")}>
          <input id="log-mail" type="email" autoComplete="email" value={f.contact.email} onChange={(e) => maj("contact.email", e.target.value)} />
        </Champ>
      </div>

      {erreur && <p className={styles.erreur} role="alert" style={{ marginTop: 14 }}>{erreur}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.bouton} disabled={envoi}>{t(envoi ? "log.envoi" : "log.envoyerDemande")}</button>
        <button type="button" className={styles.boutonSec} disabled={envoi} onClick={() => envoyer(true)}>{t("log.brouillon")}</button>
      </div>
    </form>
  );
}

// ── Liste ───────────────────────────────────────────────────────────────────
function Liste() {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const lienInitial = params.get("commande") || "";
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  const [formulaire, setFormulaire] = useState(false);

  useEffect(() => {
    api("/api/logistique/demandes")
      .then((d) => { setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }); if (!(d.demandes || []).length || lienInitial) setFormulaire(true); })
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api, lienInitial]);

  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>{t("log.titre")}</h1>
      <p className={styles.intro}>{t("log.intro")}</p>
      <p className={styles.encart}><strong>{t("log.gratuitTitre")}</strong> {t("log.gratuitTexte")}</p>

      {!formulaire && <button type="button" className={styles.bouton} onClick={() => setFormulaire(true)}>{t("log.nouvelleDemande")}</button>}
      {formulaire && <Formulaire lienInitial={lienInitial} onCree={(d) => navigate(`/logistique/demandes/${d._id}`)} />}

      <div className={styles.bloc}>
        <h2>{t("log.mesDemandes")}</h2>
        {etat.chargement && <p className={styles.attente}>{t("log.chargement")}</p>}
        {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
        {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <p className={styles.attente}>{t("log.aucuneDemande")}</p>}
        <div className={styles.grille}>
          {etat.demandes.map((d) => (
            <Link key={d._id} to={`/logistique/demandes/${d._id}`} className={styles.carte}>
              <div className={styles.carteEntete}>
                <strong>{L.type(d.typeBesoin)}</strong>
                <span className={styles.reference}>{d.reference}</span>
              </div>
              <p className={styles.trajet}>{d.depart?.ville} ({L.nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({L.nomPays(d.arrivee?.pays)})</p>
              <span className={classeStatut(d.statut)}>{L.statut(d.statut)}</span>
              {d.statut === "devis_recus" && <p className={styles.maj}>{t("log.devisAComparer", { n: d.devis.filter((x) => x.statut === "propose").length })}</p>}
              <p className={styles.maj}>{t("log.majLe", { date: L.fmtDate(d.updatedAt) })}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Détail ──────────────────────────────────────────────────────────────────
function Frise({ demande }) {
  const L = useLog();
  if (["annulee", "litige"].includes(demande.statut)) {
    return <p><span className={classeStatut(demande.statut)}>{L.statut(demande.statut)}</span>{demande.motifAnnulation && ` — ${demande.motifAnnulation}`}{demande.litige?.motif && demande.statut === "litige" && ` — ${demande.litige.motif}`}</p>;
  }
  const rang = FRISE.indexOf(demande.statut);
  const dateDe = (s) => [...(demande.evenements || [])].reverse().find((e) => e.statut === s)?.date;
  return (
    <ol className={styles.frise}>
      {FRISE.map((s, i) => {
        const etat = i < rang || demande.statut === "cloturee" ? styles.fait : i === rang ? styles.encours : styles.avenir;
        return (
          <li key={s} className={etat} aria-current={i === rang ? "step" : undefined}>
            <span className={styles.pastille} aria-hidden="true">{i < rang || demande.statut === "cloturee" ? "✓" : i + 1}</span>
            <span className={styles.libelle}>{L.statut(s)}</span>
            <span className={styles.date}>{i <= rang ? L.fmtDate(dateDe(s)) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ id }) {
  const api = useApi();
  const L = useLog();
  const { t } = L;
  const [demande, setDemande] = useState(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [motif, setMotif] = useState("");

  const charger = useCallback(() => {
    api(`/api/logistique/demandes/${id}`).then((d) => setDemande(d.demande)).catch((e) => setErreur(e.message));
  }, [api, id]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (url, corps, message, method = "POST") => {
    setOccupe(true); setErreur(""); setInfo("");
    try {
      const r = await api(url, { method, body: JSON.stringify(corps || {}) });
      setDemande(r.demande); setInfo(message); setMotif("");
      charger();
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };

  if (erreur && !demande) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/logistique" className={styles.retour}>{t("log.retourDemandes")}</Link></div>;
  if (!demande) return <div className={styles.page}><p className={styles.attente}>{t("log.chargement")}</p></div>;

  const devisVisibles = demande.devis || [];
  const m = demande.marchandise || {};
  const base = `/api/logistique/demandes/${demande._id}`;
  const decide = demande.estDemandeur !== false;
  const roleDocuments = demande.roleDemandeur === "vendeur" && decide ? "vendeur" : "acheteur";
  const deposer = async (corps) => {
    const r = await api(`${base}/documents`, { method: "POST", body: JSON.stringify(corps) });
    setDemande(r.demande); setInfo(t("log.documentDepose"));
  };

  return (
    <div className={styles.page}>
      <Link to="/logistique" className={styles.retour}>{t("log.retourDemandes")}</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{L.type(demande.typeBesoin)}</h1>
          <p className={styles.trajet}>{demande.depart.ville} ({L.nomPays(demande.depart.pays)}) → {demande.arrivee.ville} ({L.nomPays(demande.arrivee.pays)})</p>
        </div>
        <span className={styles.reference}>{demande.reference}</span>
      </div>
      {info && <p className={styles.succes} role="status">{info}</p>}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
      {!decide && <p className={styles.encart}>{t("log.organiseParVendeur")}</p>}

      {decide && demande.statut === "infos_requises" && (
        <div className={styles.bloc}>
          <h2>{t("log.precisionsTitre")}</h2>
          <p className={styles.encart}>{[...(demande.evenements || [])].reverse().find((e) => e.statut === "infos_requises")?.note}</p>
          <div className={styles.champ}>
            <label htmlFor="log-reponse">{t("log.votreReponse")}</label>
            <textarea id="log-reponse" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe || !motif.trim()}
              onClick={() => agir(base, { note: motif }, t("log.reponseEnvoyee"), "PATCH")}>{t("log.envoyerReponse")}</button>
          </div>
        </div>
      )}

      <div className={styles.bloc}>
        <h2>{t("log.suivi")}</h2>
        <Frise demande={demande} />
        {["recue", "validee", "recherche_prestataires"].includes(demande.statut) && (
          <p className={styles.maj}>{demande.nbPrestatairesSollicites ? t("log.sollicites", { n: demande.nbPrestatairesSollicites }) : t("log.examen")}</p>
        )}
      </div>

      {devisVisibles.length > 0 && (
        <div className={styles.bloc}>
          <h2>{t(demande.statut === "devis_recus" ? "log.devisComparer" : "log.devisTitre")}</h2>
          <div className={styles.devisGrille}>
            {devisVisibles.map((d) => (
              <article key={d._id} className={`${styles.devis} ${d.statut === "accepte" ? styles.devisAccepte : ""}`}>
                <strong>{d.prestataire?.raisonSociale || t("log.prestataire")}</strong>
                <span className={styles.montant}>{L.fmtMontant(d.montant, d.devise)}</span>
                <span className={styles.statut}>{L.devis(d.statut)}</span>
                {(d.delaiJoursMin != null || d.delaiJoursMax != null) && <p className={styles.petit}>{t("log.delai", { min: d.delaiJoursMin ?? "?", max: d.delaiJoursMax ?? "?" })}</p>}
                {d.inclus && <p className={styles.petit}><strong>{t("log.inclus")}</strong> {d.inclus}</p>}
                {d.exclus && <p className={styles.petit}><strong>{t("log.exclus")}</strong> {d.exclus}</p>}
                {d.fraisAdditionnels && <p className={styles.petit}><strong>{t("log.fraisEventuels")}</strong> {d.fraisAdditionnels}</p>}
                {d.modalitesPaiement && <p className={styles.petit}><strong>{t("log.paiement")}</strong> {d.modalitesPaiement}</p>}
                {d.conditionsAnnulation && <p className={styles.petit}><strong>{t("log.annulation")}</strong> {d.conditionsAnnulation}</p>}
                {d.trajet && <p className={styles.petit}><strong>{t("log.trajet")}</strong> {d.trajet}{d.modeTransport ? ` (${L.mode(d.modeTransport)})` : ""}</p>}
                <PostesDevis devis={d} />
                <p className={styles.petit}>{t(d.nature === "ferme" ? "log.prixFerme" : "log.estimation")} · {t("log.versionValidite", { v: d.version, date: L.fmtDate(d.valideJusquau) })}</p>
                {decide && demande.statut === "devis_recus" && d.statut === "propose" && (
                  <div className={styles.actions}>
                    <button type="button" className={styles.bouton} disabled={occupe}
                      onClick={() => window.confirm(t("log.confirmAccepter", { nom: d.prestataire?.raisonSociale || t("log.ceprestataire"), montant: L.fmtMontant(d.montant, d.devise) }))
                        && agir(`${base}/devis/${d._id}/accepter`, {}, t("log.devisAccepteMsg"))}>
                      {t("log.accepter")}
                    </button>
                    <button type="button" className={styles.boutonSec} disabled={occupe} onClick={() => agir(`${base}/devis/${d._id}/refuser`, {}, t("log.devisRefuseMsg"))}>{t("log.refuser")}</button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className={styles.maj}>{t("log.paiementDirect")}</p>
        </div>
      )}

      {demande.statut === "livraison_declaree" && (
        <div className={styles.bloc}>
          <h2>{t("log.livraisonDeclareeTitre")}</h2>
          <p className={styles.intro}>{t("log.livraisonDeclareeTexte")}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe} onClick={() => agir(`${base}/confirmer-livraison`, {}, t("log.receptionConfirmee"))}>{t("log.confirmerReception")}</button>
          </div>
        </div>
      )}

      <BlocConditionsRoles demande={demande} peutModifier={decide && ["brouillon", "recue", "infos_requises", "validee", "recherche_prestataires", "devis_recus"].includes(demande.statut)}
        onEnregistrer={async (corps) => { try { const r = await api(`${base}/roles`, { method: "POST", body: JSON.stringify(corps) }); setDemande(r.demande); setInfo(t("log.rolesEnregistres")); return true; } catch (e) { setErreur(e.message); return false; } }} />
      {demande.commandeLiee && <BlocEnlevement enlevement={demande.enlevement} />}
      <BlocDocuments documents={demande.documents} role={roleDocuments} onDeposer={demande.statut !== "annulee" ? deposer : null} />

      <div className={styles.bloc}>
        <h2>{t("log.votreDemande")}</h2>
        <dl className={styles.infos}>
          {demande.commandeLiee && <><dt>{t("log.commandeLiee")}</dt><dd>{L.libCommande(demande.commandeLiee)}{demande.commandeLiee.reference ? ` — ${demande.commandeLiee.reference}` : ""}{" "}
            {demande.commandeLiee.type === "booking"
              ? <Link to="/dashboard">{t("log.voirCommande")}</Link>
              : <Link to={`/import-export/transaction/${demande.commandeLiee.id}`}>{t("log.voirTransaction")}</Link>}</dd></>}
          {demande.typeBesoin === "vehicule"
            ? <><dt>{t("log.vehicule")}</dt><dd>{[m.vehicule?.marque, m.vehicule?.modele, m.vehicule?.annee].filter(Boolean).join(" ")}{m.vehicule?.roulant === false ? t("log.nonRoulant") : ""}</dd></>
            : <><dt>{t("log.marchandise")}</dt><dd>{m.description}{m.quantite > 1 ? t("log.unites", { n: m.quantite }) : ""}{m.poidsKg ? ` — ${m.poidsKg} kg` : ""}</dd></>}
          <dt>{t("log.modeSouhaite")}</dt><dd>{L.mode(demande.modeSouhaite)}</dd>
          <dt>{t("log.dateSouhaitee")}</dt><dd>{L.fmtDate(demande.dateSouhaitee)}</dd>
          {m.contraintes && <><dt>{t("log.contraintes")}</dt><dd>{m.contraintes}</dd></>}
          {demande.documentsDisponibles && <><dt>{t("log.documents")}</dt><dd>{demande.documentsDisponibles}</dd></>}
        </dl>
      </div>

      {((decide && ANNULABLE_PAR_CLIENT.includes(demande.statut)) || LITIGE_OUVRABLE.includes(demande.statut)) && (
        <div className={styles.bloc}>
          <h2>{t("log.unProbleme")}</h2>
          <div className={styles.champ}>
            <label htmlFor="log-motif">{t(LITIGE_OUVRABLE.includes(demande.statut) ? "log.motifLitige" : "log.motifAnnulation")}</label>
            <textarea id="log-motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>
          <div className={styles.actions}>
            {decide && ANNULABLE_PAR_CLIENT.includes(demande.statut) && (
              <button type="button" className={styles.boutonDanger} disabled={occupe}
                onClick={() => window.confirm(t("log.confirmAnnuler")) && agir(`${base}/annuler`, { motif }, t("log.demandeAnnulee"))}>{t("log.annulerDemande")}</button>
            )}
            {LITIGE_OUVRABLE.includes(demande.statut) && (
              <button type="button" className={styles.boutonSec} disabled={occupe || !motif.trim()} onClick={() => agir(`${base}/litige`, { motif }, t("log.problemeSignale"))}>{t("log.signalerProbleme")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Logistique() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLog();
  const navigate = useNavigate();
  useDocumentMeta({ title: t("log.metaTitre"), description: t("log.metaDesc"), robots: "noindex" });
  useEffect(() => {
    if (!token) navigate("/login", { state: { from: { pathname: id ? `/logistique/demandes/${id}` : "/logistique" } } });
  }, [token, navigate, id]);
  if (!token) return null;
  return id ? <Detail id={id} /> : <Liste />;
}
