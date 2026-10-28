import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import {
  TYPES_BESOIN, MODES_TRANSPORT, LIBELLES_STATUT, FRISE, ANNULABLE_PAR_CLIENT, LITIGE_OUVRABLE,
  LIBELLES_DEVIS, PAYS, nomPays,
} from "../constants/logistique";
import styles from "./Logistique.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO Logistique — espace client (2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Mise en relation GRATUITE : le client décrit son besoin, VIT AUTO sollicite
// des transporteurs et transitaires partenaires, le client compare les devis
// et règle le prestataire retenu directement, selon ses conditions. VIT AUTO
// n'est ni transporteur ni transitaire et ne prélève rien.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtMontant = (n, devise) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise || ""}`.trim());

function useApi() {
  const { token } = useAuth();
  return useCallback(async (url, options = {}) => {
    const r = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(corps.message || "Erreur réseau."), { champs: corps.champs || [] });
    return corps;
  }, [token]);
}

const classeStatut = (s) => (["annulee", "litige", "infos_requises"].includes(s) ? `${styles.statut} ${styles.statutAlerte}` : s === "cloturee" ? `${styles.statut} ${styles.statutFin}` : styles.statut);

const LIBELLES_CHAMPS = {
  "depart.pays": "pays de départ", "depart.ville": "ville de départ", "arrivee.pays": "pays d'arrivée", "arrivee.ville": "ville d'arrivée",
  "marchandise.vehicule.marque": "marque du véhicule", "marchandise.vehicule.modele": "modèle du véhicule",
  "marchandise.description": "description de la marchandise", contact: "téléphone ou e-mail", typeBesoin: "type de besoin",
};

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

function Formulaire({ onCree }) {
  const api = useApi();
  const [f, setF] = useState(VIDE);
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
  const msg = (c) => (manquants.includes(c) ? "Champ requis." : null);

  const envoyer = async (brouillon) => {
    setEnvoi(true); setErreur(""); setManquants([]);
    try {
      const v = f.marchandise.vehicule;
      const corps = {
        ...f, brouillon,
        marchandise: { ...f.marchandise, vehicule: f.typeBesoin === "vehicule" ? { ...v, annee: v.annee || null } : undefined },
      };
      const r = await api("/api/logistique/demandes", { method: "POST", body: JSON.stringify(corps) });
      onCree(r.demande);
    } catch (e) {
      setErreur(e.champs?.length ? `À compléter : ${e.champs.map((c) => LIBELLES_CHAMPS[c] || c).join(", ")}.` : e.message);
      setManquants(e.champs || []);
    } finally { setEnvoi(false); }
  };

  const pays = (id, valeur, chemin, label) => (
    <Champ id={id} label={label} erreur={msg(chemin)}>
      <select id={id} value={valeur} aria-invalid={invalide(chemin)} onChange={(e) => maj(chemin, e.target.value)}>
        <option value="">Choisir…</option>
        {PAYS.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.name}</option>)}
      </select>
    </Champ>
  );

  return (
    <form className={styles.bloc} onSubmit={(e) => { e.preventDefault(); envoyer(false); }} noValidate>
      <h2>Nouvelle demande</h2>
      <div className={styles.choixType} role="group" aria-label="Type de besoin">
        {TYPES_BESOIN.map((t) => (
          <button key={t.code} type="button" className={styles.choix} aria-pressed={f.typeBesoin === t.code} onClick={() => maj("typeBesoin", t.code)}>
            <span aria-hidden="true">{t.icone}</span>{t.libelle}
          </button>
        ))}
      </div>

      <div className={styles.formGrille}>
        {pays("log-dep-pays", f.depart.pays, "depart.pays", "Pays de départ")}
        <Champ id="log-dep-ville" label="Ville de départ" erreur={msg("depart.ville")}>
          <input id="log-dep-ville" value={f.depart.ville} aria-invalid={invalide("depart.ville")} onChange={(e) => maj("depart.ville", e.target.value)} autoComplete="address-level2" />
        </Champ>
        {pays("log-arr-pays", f.arrivee.pays, "arrivee.pays", "Pays de destination")}
        <Champ id="log-arr-ville" label="Ville de destination" erreur={msg("arrivee.ville")}>
          <input id="log-arr-ville" value={f.arrivee.ville} aria-invalid={invalide("arrivee.ville")} onChange={(e) => maj("arrivee.ville", e.target.value)} />
        </Champ>

        {f.typeBesoin === "vehicule" ? (
          <>
            <Champ id="log-marque" label="Marque" erreur={msg("marchandise.vehicule.marque")}>
              <input id="log-marque" value={f.marchandise.vehicule.marque} aria-invalid={invalide("marchandise.vehicule.marque")} onChange={(e) => maj("marchandise.vehicule.marque", e.target.value)} />
            </Champ>
            <Champ id="log-modele" label="Modèle" erreur={msg("marchandise.vehicule.modele")}>
              <input id="log-modele" value={f.marchandise.vehicule.modele} aria-invalid={invalide("marchandise.vehicule.modele")} onChange={(e) => maj("marchandise.vehicule.modele", e.target.value)} />
            </Champ>
            <Champ id="log-annee" label="Année (facultatif)">
              <input id="log-annee" type="number" inputMode="numeric" min="1900" max="2100" value={f.marchandise.vehicule.annee} onChange={(e) => maj("marchandise.vehicule.annee", e.target.value)} />
            </Champ>
            <div className={styles.champ}>
              <span className={styles.legende}>État</span>
              <label className={styles.caseLigne}>
                <input type="checkbox" checked={f.marchandise.vehicule.roulant === true} onChange={(e) => maj("marchandise.vehicule.roulant", e.target.checked)} />
                Le véhicule roule
              </label>
            </div>
          </>
        ) : (
          <>
            <div className={styles.pleine}>
              <Champ id="log-desc" label="Nature de la marchandise" erreur={msg("marchandise.description")} aide="Ex. : 2 palettes de plaquettes de frein, 1 moteur sur palette…">
                <textarea id="log-desc" value={f.marchandise.description} aria-invalid={invalide("marchandise.description")} onChange={(e) => maj("marchandise.description", e.target.value)} />
              </Champ>
            </div>
            <Champ id="log-qte" label="Quantité (colis, palettes…)">
              <input id="log-qte" type="number" inputMode="numeric" min="1" value={f.marchandise.quantite} onChange={(e) => maj("marchandise.quantite", e.target.value)} />
            </Champ>
            <Champ id="log-poids" label="Poids total, kg (facultatif)">
              <input id="log-poids" type="number" inputMode="decimal" min="0" value={f.marchandise.poidsKg} onChange={(e) => maj("marchandise.poidsKg", e.target.value)} />
            </Champ>
            <Champ id="log-dim" label="Dimensions L × l × h, cm (facultatif)">
              <div style={{ display: "flex", gap: 6 }}>
                {["longueurCm", "largeurCm", "hauteurCm"].map((k, i) => (
                  <input key={k} aria-label={["Longueur", "Largeur", "Hauteur"][i]} type="number" inputMode="decimal" min="0" value={f.marchandise[k]} onChange={(e) => maj(`marchandise.${k}`, e.target.value)} />
                ))}
              </div>
            </Champ>
          </>
        )}

        <Champ id="log-mode" label="Mode de transport souhaité">
          <select id="log-mode" value={f.modeSouhaite} onChange={(e) => maj("modeSouhaite", e.target.value)}>
            {MODES_TRANSPORT.map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}
          </select>
        </Champ>
        <Champ id="log-date" label="Date souhaitée (facultatif)">
          <input id="log-date" type="date" value={f.dateSouhaitee} onChange={(e) => maj("dateSouhaitee", e.target.value)} />
        </Champ>
        <div className={styles.pleine}>
          <Champ id="log-contraintes" label="Contraintes particulières (facultatif)" aide="Accès, horaires, fragilité, matière dangereuse…">
            <textarea id="log-contraintes" value={f.marchandise.contraintes} onChange={(e) => maj("marchandise.contraintes", e.target.value)} />
          </Champ>
        </div>
        <div className={styles.pleine}>
          <Champ id="log-docs" label="Documents dont vous disposez (facultatif)" aide="Carte grise, facture, certificat de conformité, liste de colisage…">
            <input id="log-docs" value={f.documentsDisponibles} onChange={(e) => maj("documentsDisponibles", e.target.value)} />
          </Champ>
        </div>
        <Champ id="log-tel" label="Téléphone de contact" erreur={msg("contact")} aide="Communiqué au seul prestataire que vous retiendrez.">
          <input id="log-tel" type="tel" autoComplete="tel" value={f.contact.telephone} aria-invalid={invalide("contact")} onChange={(e) => maj("contact.telephone", e.target.value)} />
        </Champ>
        <Champ id="log-mail" label="E-mail de contact (facultatif)" aide="Par défaut, celui de votre compte.">
          <input id="log-mail" type="email" autoComplete="email" value={f.contact.email} onChange={(e) => maj("contact.email", e.target.value)} />
        </Champ>
      </div>

      {erreur && <p className={styles.erreur} role="alert" style={{ marginTop: 14 }}>{erreur}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.bouton} disabled={envoi}>{envoi ? "Envoi…" : "Envoyer la demande"}</button>
        <button type="button" className={styles.boutonSec} disabled={envoi} onClick={() => envoyer(true)}>Enregistrer un brouillon</button>
      </div>
    </form>
  );
}

// ── Liste ───────────────────────────────────────────────────────────────────
function Liste() {
  const api = useApi();
  const navigate = useNavigate();
  const [etat, setEtat] = useState({ chargement: true, demandes: [], erreur: "" });
  const [formulaire, setFormulaire] = useState(false);

  useEffect(() => {
    api("/api/logistique/demandes")
      .then((d) => { setEtat({ chargement: false, demandes: d.demandes || [], erreur: "" }); if (!(d.demandes || []).length) setFormulaire(true); })
      .catch((e) => setEtat({ chargement: false, demandes: [], erreur: e.message }));
  }, [api]);

  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>📦 VIT-AUTO Logistique</h1>
      <p className={styles.intro}>
        Décrivez votre transport de véhicule ou de pièces : nous le transmettons à des transporteurs et transitaires
        partenaires, vous comparez leurs devis et choisissez librement.
      </p>
      <p className={styles.encart}>
        <strong>Mise en relation gratuite.</strong> VIT AUTO ne prélève aucune commission ni aucun frais sur la logistique.
        Le prix du transport se règle directement avec le prestataire retenu, selon ses conditions. VIT AUTO n'est ni
        transporteur, ni transitaire, ni commissionnaire en douane.
      </p>

      {!formulaire && <button type="button" className={styles.bouton} onClick={() => setFormulaire(true)}>Nouvelle demande</button>}
      {formulaire && <Formulaire onCree={(d) => navigate(`/logistique/demandes/${d._id}`)} />}

      <div className={styles.bloc}>
        <h2>Mes demandes</h2>
        {etat.chargement && <p className={styles.attente}>Chargement…</p>}
        {etat.erreur && <p className={styles.erreur}>{etat.erreur}</p>}
        {!etat.chargement && !etat.erreur && etat.demandes.length === 0 && <p className={styles.attente}>Aucune demande pour l'instant.</p>}
        <div className={styles.grille}>
          {etat.demandes.map((d) => (
            <Link key={d._id} to={`/logistique/demandes/${d._id}`} className={styles.carte}>
              <div className={styles.carteEntete}>
                <strong>{TYPES_BESOIN.find((t) => t.code === d.typeBesoin)?.libelle}</strong>
                <span className={styles.reference}>{d.reference}</span>
              </div>
              <p className={styles.trajet}>{d.depart?.ville} ({nomPays(d.depart?.pays)}) → {d.arrivee?.ville} ({nomPays(d.arrivee?.pays)})</p>
              <span className={classeStatut(d.statut)}>{LIBELLES_STATUT[d.statut]}</span>
              {d.statut === "devis_recus" && <p className={styles.maj}>{d.devis.filter((x) => x.statut === "propose").length} devis à comparer</p>}
              <p className={styles.maj}>Mise à jour le {fmtDate(d.updatedAt)}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Détail ──────────────────────────────────────────────────────────────────
function Frise({ demande }) {
  if (["annulee", "litige"].includes(demande.statut)) {
    return <p><span className={classeStatut(demande.statut)}>{LIBELLES_STATUT[demande.statut]}</span>{demande.motifAnnulation && ` — ${demande.motifAnnulation}`}{demande.litige?.motif && demande.statut === "litige" && ` — ${demande.litige.motif}`}</p>;
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
            <span className={styles.libelle}>{LIBELLES_STATUT[s]}</span>
            <span className={styles.date}>{i <= rang ? fmtDate(dateDe(s)) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ id }) {
  const api = useApi();
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

  if (erreur && !demande) return <div className={styles.page}><p className={styles.erreur}>{erreur}</p><Link to="/logistique" className={styles.retour}>← Mes demandes</Link></div>;
  if (!demande) return <div className={styles.page}><p className={styles.attente}>Chargement…</p></div>;

  const devisVisibles = demande.devis || [];
  const m = demande.marchandise || {};
  const base = `/api/logistique/demandes/${demande._id}`;

  return (
    <div className={styles.page}>
      <Link to="/logistique" className={styles.retour}>← Mes demandes</Link>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{TYPES_BESOIN.find((t) => t.code === demande.typeBesoin)?.libelle}</h1>
          <p className={styles.trajet}>{demande.depart.ville} ({nomPays(demande.depart.pays)}) → {demande.arrivee.ville} ({nomPays(demande.arrivee.pays)})</p>
        </div>
        <span className={styles.reference}>{demande.reference}</span>
      </div>
      {info && <p className={styles.succes} role="status">{info}</p>}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}

      {demande.statut === "infos_requises" && (
        <div className={styles.bloc}>
          <h2>VIT AUTO a besoin de précisions</h2>
          <p className={styles.encart}>{[...(demande.evenements || [])].reverse().find((e) => e.statut === "infos_requises")?.note}</p>
          <div className={styles.champ}>
            <label htmlFor="log-reponse">Votre réponse</label>
            <textarea id="log-reponse" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe || !motif.trim()}
              onClick={() => agir(base, { note: motif }, "Réponse envoyée : votre demande est de nouveau à l'étude.", "PATCH")}>Envoyer ma réponse</button>
          </div>
        </div>
      )}

      <div className={styles.bloc}>
        <h2>Suivi</h2>
        <Frise demande={demande} />
        {["recue", "validee", "recherche_prestataires"].includes(demande.statut) && (
          <p className={styles.maj}>{demande.nbPrestatairesSollicites ? `${demande.nbPrestatairesSollicites} prestataire(s) consulté(s). Vous serez prévenu à chaque devis.` : "VIT AUTO examine votre demande et va consulter des prestataires adaptés."}</p>
        )}
      </div>

      {devisVisibles.length > 0 && (
        <div className={styles.bloc}>
          <h2>Devis{demande.statut === "devis_recus" ? " — comparez et choisissez" : ""}</h2>
          <div className={styles.devisGrille}>
            {devisVisibles.map((d) => (
              <article key={d._id} className={`${styles.devis} ${d.statut === "accepte" ? styles.devisAccepte : ""}`}>
                <strong>{d.prestataire?.raisonSociale || "Prestataire"}</strong>
                <span className={styles.montant}>{fmtMontant(d.montant, d.devise)}</span>
                <span className={styles.statut}>{LIBELLES_DEVIS[d.statut]}</span>
                {(d.delaiJoursMin != null || d.delaiJoursMax != null) && <p className={styles.petit}>Délai : {d.delaiJoursMin ?? "?"} à {d.delaiJoursMax ?? "?"} jours</p>}
                {d.inclus && <p className={styles.petit}><strong>Inclus :</strong> {d.inclus}</p>}
                {d.exclus && <p className={styles.petit}><strong>Exclus :</strong> {d.exclus}</p>}
                {d.fraisAdditionnels && <p className={styles.petit}><strong>Frais éventuels :</strong> {d.fraisAdditionnels}</p>}
                {d.modalitesPaiement && <p className={styles.petit}><strong>Paiement :</strong> {d.modalitesPaiement}</p>}
                {d.conditionsAnnulation && <p className={styles.petit}><strong>Annulation :</strong> {d.conditionsAnnulation}</p>}
                <p className={styles.petit}>Valable jusqu'au {fmtDate(d.valideJusquau)}</p>
                {demande.statut === "devis_recus" && d.statut === "propose" && (
                  <div className={styles.actions}>
                    <button type="button" className={styles.bouton} disabled={occupe}
                      onClick={() => window.confirm(`Accepter le devis de ${d.prestataire?.raisonSociale || "ce prestataire"} à ${fmtMontant(d.montant, d.devise)} ? Vos coordonnées lui seront transmises et les autres devis seront écartés.`)
                        && agir(`${base}/devis/${d._id}/accepter`, {}, "Devis accepté : le prestataire va confirmer la commande.")}>
                      Accepter
                    </button>
                    <button type="button" className={styles.boutonSec} disabled={occupe} onClick={() => agir(`${base}/devis/${d._id}/refuser`, {}, "Devis refusé.")}>Refuser</button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className={styles.maj}>Le paiement du transport se fait directement auprès du prestataire retenu. VIT AUTO ne perçoit rien.</p>
        </div>
      )}

      {demande.statut === "livraison_declaree" && (
        <div className={styles.bloc}>
          <h2>Le prestataire a déclaré la livraison</h2>
          <p className={styles.intro}>Confirmez la réception si tout est conforme, sinon signalez un problème.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={occupe} onClick={() => agir(`${base}/confirmer-livraison`, {}, "Réception confirmée : opération clôturée.")}>Confirmer la réception</button>
          </div>
        </div>
      )}

      <div className={styles.bloc}>
        <h2>Votre demande</h2>
        <dl className={styles.infos}>
          {demande.typeBesoin === "vehicule"
            ? <><dt>Véhicule</dt><dd>{[m.vehicule?.marque, m.vehicule?.modele, m.vehicule?.annee].filter(Boolean).join(" ")}{m.vehicule?.roulant === false ? " — non roulant" : ""}</dd></>
            : <><dt>Marchandise</dt><dd>{m.description}{m.quantite > 1 ? ` — ${m.quantite} unités` : ""}{m.poidsKg ? ` — ${m.poidsKg} kg` : ""}</dd></>}
          <dt>Mode souhaité</dt><dd>{MODES_TRANSPORT.find((x) => x.code === demande.modeSouhaite)?.libelle}</dd>
          <dt>Date souhaitée</dt><dd>{fmtDate(demande.dateSouhaitee)}</dd>
          {m.contraintes && <><dt>Contraintes</dt><dd>{m.contraintes}</dd></>}
          {demande.documentsDisponibles && <><dt>Documents</dt><dd>{demande.documentsDisponibles}</dd></>}
        </dl>
      </div>

      {(ANNULABLE_PAR_CLIENT.includes(demande.statut) || LITIGE_OUVRABLE.includes(demande.statut)) && (
        <div className={styles.bloc}>
          <h2>Un problème ?</h2>
          <div className={styles.champ}>
            <label htmlFor="log-motif">{LITIGE_OUVRABLE.includes(demande.statut) ? "Décrivez le problème ou le motif d'annulation" : "Motif d'annulation (facultatif)"}</label>
            <textarea id="log-motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>
          <div className={styles.actions}>
            {ANNULABLE_PAR_CLIENT.includes(demande.statut) && (
              <button type="button" className={styles.boutonDanger} disabled={occupe}
                onClick={() => window.confirm("Annuler cette demande ?") && agir(`${base}/annuler`, { motif }, "Demande annulée.")}>Annuler la demande</button>
            )}
            {LITIGE_OUVRABLE.includes(demande.statut) && (
              <button type="button" className={styles.boutonSec} disabled={occupe || !motif.trim()} onClick={() => agir(`${base}/litige`, { motif }, "Problème signalé : VIT AUTO revient vers vous.")}>Signaler un problème</button>
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
  const navigate = useNavigate();
  useDocumentMeta({ title: "VIT-AUTO Logistique — transport de véhicules et de pièces", description: "Demandez un transport de véhicule ou de pièces détachées et comparez les devis de prestataires partenaires. Mise en relation gratuite.", robots: "noindex" });
  useEffect(() => {
    if (!token) navigate("/login", { state: { from: { pathname: id ? `/logistique/demandes/${id}` : "/logistique" } } });
  }, [token, navigate, id]);
  if (!token) return null;
  return id ? <Detail id={id} /> : <Liste />;
}
