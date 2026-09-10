import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PLAN_SEATS, PLAN_SUPPORT_SLA_HOURS, API_RATE_LIMIT_PER_HOUR, LIBELLE_PLAN, AVANCE_DEMANDES_HEURES } from "../constants/planFeatures";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import styles from "./VendorPro.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// ESPACE PRO — ce que l'abonnement ouvre réellement, en un seul endroit
// ═══════════════════════════════════════════════════════════════════════════
// Les avantages d'un abonnement dispersés dans cinq écrans ne se voient pas :
// le partenaire paie et ne constate rien. Les réunir ici donne au palier une
// adresse — et rend le verrou visible pour qui n'a pas encore souscrit, ce qui
// est la seule façon honnête de vendre un abonnement.

const ONGLETS = [
  { id: "stats",    libelle: "Statistiques", icone: "📊" },
  { id: "demandes", libelle: "Demandes clients", icone: "📨" },
  { id: "equipe",  libelle: "Équipe",       icone: "👥" },
  { id: "api",     libelle: "Accès API",    icone: "🔌" },
  { id: "support", libelle: "Assistance",   icone: "🎧" },
];

// Écran affiché quand le palier ne couvre pas la fonctionnalité. Il ne se
// contente pas de refuser : il nomme le palier qui l'ouvre et mène à la
// demande. Un verrou sans issue est une impasse, pas une incitation.
function Verrou({ message, titre }) {
  return (
    <div className={styles.verrou}>
      <div className={styles.verrouIcone} aria-hidden="true">🔒</div>
      <h3>{titre}</h3>
      <p>{message}</p>
      <Link to="/plans" className={styles.btnPrimaire}>Voir les formules</Link>
    </div>
  );
}

export default function VendorPro() {
  useDocumentMeta({
    title: "Espace Pro partenaire",
    description: "Statistiques, équipe, accès API et assistance prioritaire de votre formule VIT AUTO.",
    robots: "noindex, nofollow",
  });

  const { token } = useAuth();
  const [onglet, setOnglet] = useState("stats");
  const [plan, setPlan] = useState(null);
  const [abonnement, setAbonnement] = useState(null);

  const appel = useCallback(async (url, options = {}) => {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      // Le corps peut être vide (204) ou non-JSON : lire aveuglément en JSON
      // ferait échouer un appel qui a pourtant réussi. L'accès à `headers` est
      // gardé — une coupure réseau ou un intermédiaire peut rendre une réponse
      // incomplète, et une exception ici remplacerait tout l'écran par
      // l'ErrorBoundary alors qu'un seul onglet est concerné.
      const type = res.headers?.get?.("content-type") || "";
      const corps = type.includes("json") || !res.headers
        ? await res.json().catch(() => ({}))
        : null;
      return { ok: res.ok, statut: res.status, corps };
    } catch {
      return { ok: false, statut: 0, corps: { message: "Connexion au serveur impossible. Réessayez." } };
    }
  }, [token]);

  useEffect(() => {
    let annule = false;
    appel("/api/subscriptions/me").then(({ ok, corps }) => {
      if (annule || !ok) return;
      setPlan(corps?.subscription?.plan || "free");
      setAbonnement(corps?.subscription || null);
    });
    return () => { annule = true; };
  }, [appel]);

  return (
    <div className={styles.page}>
      <header className={styles.entete}>
        <div>
          <h1>Espace Pro</h1>
          <p className={styles.sousTitre}>
            {plan
              ? <>
                  Formule en cours : <strong>{LIBELLE_PLAN[plan] || plan}</strong>
                  {/* Un essai doit se dire : laisser croire à un abonnement payé
                      rendrait son expiration incompréhensible. */}
                  {abonnement?.planDetails?.isTrial && (
                    <> — <strong>essai gratuit</strong> jusqu'au{" "}
                      {new Date(abonnement.planDetails.endDate).toLocaleDateString("fr-FR")}</>
                  )}
                </>
              : "Chargement de votre formule…"}
          </p>
        </div>
        <Link to="/vendor/dashboard" className={styles.btnSecondaire}>← Tableau de bord</Link>
      </header>

      <nav className={styles.onglets} role="tablist">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={onglet === o.id}
            className={onglet === o.id ? styles.ongletActif : styles.onglet}
            onClick={() => setOnglet(o.id)}
          >
            <span aria-hidden="true">{o.icone}</span> {o.libelle}
          </button>
        ))}
      </nav>

      <div className={styles.contenu}>
        {onglet === "stats"    && <Statistiques appel={appel} token={token} />}
        {onglet === "demandes" && <Demandes appel={appel} />}
        {onglet === "equipe"  && <Equipe appel={appel} />}
        {onglet === "api"     && <ClesApi appel={appel} />}
        {onglet === "support" && <Assistance appel={appel} />}
      </div>
    </div>
  );
}

// ── Statistiques + export ──────────────────────────────────────────────────
function Statistiques({ appel, token }) {
  const [etat, setEtat] = useState({ chargement: true });
  const [export_, setExport] = useState({ occupe: false, erreur: "" });

  useEffect(() => {
    let annule = false;
    appel("/api/subscriptions/insights").then(({ ok, corps }) => {
      if (!annule) setEtat({ chargement: false, ok, ...corps });
    });
    return () => { annule = true; };
  }, [appel]);

  const telecharger = async () => {
    setExport({ occupe: true, erreur: "" });
    try {
      const res = await fetch("/api/subscriptions/insights/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const corps = await res.json().catch(() => ({}));
        setExport({ occupe: false, erreur: corps.message || "Export indisponible." });
        return;
      }
      // Passage par un blob : le fichier est servi sur une route authentifiée,
      // un simple <a href> n'y joindrait pas le jeton et recevrait un 401.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vit-auto-statistiques-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExport({ occupe: false, erreur: "" });
    } catch {
      setExport({ occupe: false, erreur: "Le téléchargement a échoué. Réessayez." });
    }
  };

  if (etat.chargement) return <p className={styles.attente}>Chargement…</p>;
  if (!etat.ok) return <Verrou titre="Statistiques de performance" message={etat.message} />;

  const { resume, annonces = [] } = etat;
  if (!annonces.length) return <p className={styles.attente}>Publiez une annonce pour voir vos statistiques.</p>;

  return (
    <>
      <div className={styles.barreAction}>
        <button className={styles.btnPrimaire} onClick={telecharger} disabled={export_.occupe}>
          {export_.occupe ? "Préparation…" : "⬇ Exporter en tableur (CSV)"}
        </button>
        {export_.erreur && <span className={styles.erreur}>{export_.erreur}</span>}
      </div>

      {resume && (
        <div className={styles.cartes}>
          <Carte valeur={resume.annonces}     libelle="Annonces publiées" />
          <Carte valeur={resume.vuesTotales}  libelle="Vues cumulées" />
          <Carte valeur={resume.reservations} libelle="Réservations" />
          <Carte valeur={resume.favoris}      libelle="Mises en favori" />
          <Carte valeur={resume.aCorriger}    libelle="Annonces à améliorer" accent={resume.aCorriger > 0} />
        </div>
      )}

      <div className={styles.tableauEnveloppe}>
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th>Annonce</th><th>Ville</th><th>Vues</th><th>Favoris</th>
              <th>Réservations</th><th>Conversion</th><th>Écart médiane</th>
            </tr>
          </thead>
          <tbody>
            {annonces.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.titre}
                  {a.conseils?.length > 0 && (
                    <ul className={styles.conseils}>
                      {a.conseils.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  )}
                </td>
                <td>{a.ville || "—"}</td>
                <td>{a.vues}</td>
                <td>{a.favoris}</td>
                <td>{a.reservations}</td>
                <td>{a.tauxConversion == null ? "—" : `${a.tauxConversion} %`}</td>
                <td>{a.ecartMediane == null ? "—" : `${a.ecartMediane > 0 ? "+" : ""}${a.ecartMediane} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const Carte = ({ valeur, libelle, accent }) => (
  <div className={accent ? styles.carteAccent : styles.carte}>
    <strong>{valeur ?? 0}</strong>
    <span>{libelle}</span>
  </div>
);

// ── Demandes clients ───────────────────────────────────────────────────────
function Demandes({ appel }) {
  const [etat, setEtat] = useState({ chargement: true });
  const [note, setNote] = useState({});
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const { ok, corps } = await appel("/api/partner-requests");
    setEtat({ chargement: false, ok, ...corps });
  }, [appel]);

  useEffect(() => { charger(); }, [charger]);

  const seProposer = async (id) => {
    setErreur("");
    const { ok, corps } = await appel(`/api/partner-requests/${id}/interest`, {
      method: "POST", body: JSON.stringify({ note: note[id] || "" }),
    });
    if (!ok) return setErreur(corps?.message || "Envoi impossible.");
    charger();
  };

  if (etat.chargement) return <p className={styles.attente}>Chargement…</p>;

  const { demandes = [], prioritaire, enAttenteDeliberation } = etat;
  return (
    <>
      <p className={prioritaire ? styles.infoAccent : styles.info}>
        {prioritaire
          ? `Vous voyez chaque demande dès son dépôt, ${AVANCE_DEMANDES_HEURES} h avant les partenaires non abonnés.`
          : <>Les demandes vous parviennent {AVANCE_DEMANDES_HEURES} h après leur dépôt.
              {enAttenteDeliberation > 0 && <> <strong>{enAttenteDeliberation} demande{enAttenteDeliberation > 1 ? "s" : ""}</strong> {enAttenteDeliberation > 1 ? "sont" : "est"} en ce moment réservée{enAttenteDeliberation > 1 ? "s" : ""} aux abonnés Business et Exportateur.</>}
              {" "}<Link to="/plans">Voir les formules</Link>.</>}
      </p>

      {erreur && <p className={styles.erreur}>{erreur}</p>}

      {demandes.length === 0 ? (
        <p className={styles.attente}>Aucune demande ouverte pour l'instant.</p>
      ) : (
        <div className={styles.cartesDemandes}>
          {demandes.map((d) => (
            <article key={d.id} className={styles.demande}>
              <header>
                <strong>{d.vehicule || d.type || "Véhicule non précisé"}</strong>
                <span>{d.origine || "?"} → {d.destination || "?"}</span>
              </header>
              <dl className={styles.detailsDemande}>
                <div><dt>Budget</dt><dd>{d.budget ? `${d.budget.toLocaleString("fr-FR")} ${d.devise}` : "non précisé"}</dd></div>
                <div><dt>Service</dt><dd>{d.service}</dd></div>
                <div><dt>Déposée</dt><dd>{new Date(d.deposeeLe).toLocaleDateString("fr-FR")}</dd></div>
                <div><dt>Candidats</dt><dd>{d.candidats}</dd></div>
              </dl>
              {d.message && <p className={styles.messageDemande}>« {d.message} »</p>}
              {d.jaiRepondu ? (
                <p className={styles.dejaPositionne}>✓ Vous vous êtes positionné. L'équipe VIT AUTO vous mettra en relation.</p>
              ) : (
                <>
                  <input
                    placeholder="Ce que vous pouvez proposer (facultatif)"
                    value={note[d.id] || ""}
                    onChange={(e) => setNote({ ...note, [d.id]: e.target.value })}
                  />
                  <button className={styles.btnPrimaire} onClick={() => seProposer(d.id)}>Je peux répondre</button>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// ── Équipe ─────────────────────────────────────────────────────────────────
function Equipe({ appel }) {
  const [etat, setEtat] = useState({ chargement: true });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", teamRole: "gestionnaire" });
  const [nouveau, setNouveau] = useState(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const { ok, corps } = await appel("/api/team/members");
    setEtat({ chargement: false, ok, ...corps });
  }, [appel]);

  useEffect(() => { charger(); }, [charger]);

  const creer = async (e) => {
    e.preventDefault();
    setOccupe(true); setErreur(""); setNouveau(null);
    const { ok, corps } = await appel("/api/team/members", { method: "POST", body: JSON.stringify(form) });
    setOccupe(false);
    if (!ok) return setErreur(corps?.message || "Création impossible.");
    setNouveau(corps);
    setForm({ firstName: "", lastName: "", email: "", phone: "", teamRole: "gestionnaire" });
    charger();
  };

  const retirer = async (id) => {
    if (!window.confirm("Retirer cet accès ? La personne ne pourra plus se connecter à votre espace.")) return;
    await appel(`/api/team/members/${id}`, { method: "DELETE" });
    charger();
  };

  if (etat.chargement) return <p className={styles.attente}>Chargement…</p>;
  if (!etat.ok) {
    return (
      <Verrou
        titre="Comptes d'équipe"
        message={`${etat.message} Chaque accès a son propre identifiant : vous savez qui publie, qui répond, et vous coupez un accès sans changer votre mot de passe. Le plan Business ouvre ${PLAN_SEATS.business} accès, l'Exportateur ${PLAN_SEATS.exportateur}.`}
      />
    );
  }

  const { membres = [], sieges } = etat;
  return (
    <>
      <p className={styles.info}>
        <strong>{sieges.utilises}</strong> accès sur <strong>{sieges.total}</strong> utilisés, vous compris.
      </p>

      {membres.length > 0 && (
        <div className={styles.tableauEnveloppe}>
          <table className={styles.tableau}>
            <thead><tr><th>Nom</th><th>Contact</th><th>Rôle</th><th>État</th><th></th></tr></thead>
            <tbody>
              {membres.map((m) => (
                <tr key={m._id}>
                  <td>{m.firstName} {m.lastName}</td>
                  <td>{m.email || m.phone || "—"}</td>
                  <td>{m.teamRole === "lecture" ? "Consultation seule" : "Gestionnaire"}</td>
                  <td>{m.isActive ? "Actif" : "Désactivé"}</td>
                  <td><button className={styles.btnDanger} onClick={() => retirer(m._id)}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nouveau && (
        <div className={styles.succes}>
          <p><strong>Accès créé pour {nouveau.membre.firstName} {nouveau.membre.lastName}.</strong></p>
          <p>Mot de passe provisoire : <code className={styles.code}>{nouveau.motDePasseProvisoire}</code></p>
          <p className={styles.avis}>{nouveau.avis}</p>
        </div>
      )}

      {sieges.restants > 0 ? (
        <form className={styles.formulaire} onSubmit={creer}>
          <h3>Ajouter un accès</h3>
          <div className={styles.champs}>
            <input required placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <input required placeholder="Nom"    value={form.lastName}  onChange={(e) => setForm({ ...form, lastName:  e.target.value })} />
            <input type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Téléphone"          value={form.phone}  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select value={form.teamRole} onChange={(e) => setForm({ ...form, teamRole: e.target.value })}>
              <option value="gestionnaire">Gestionnaire — publie et gère les réservations</option>
              <option value="lecture">Consultation seule — ne modifie rien</option>
            </select>
          </div>
          {erreur && <p className={styles.erreur}>{erreur}</p>}
          <button className={styles.btnPrimaire} disabled={occupe}>{occupe ? "Création…" : "Créer l'accès"}</button>
        </form>
      ) : (
        <p className={styles.info}>Tous vos accès sont utilisés. Passez au palier supérieur pour en ouvrir davantage.</p>
      )}
    </>
  );
}

// ── Clés d'API ─────────────────────────────────────────────────────────────
function ClesApi({ appel }) {
  const [etat, setEtat] = useState({ chargement: true });
  const [label, setLabel] = useState("");
  const [ecriture, setEcriture] = useState(false);
  const [nouvelle, setNouvelle] = useState(null);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const { ok, corps } = await appel("/api/api-keys");
    setEtat({ chargement: false, ok, ...corps });
  }, [appel]);

  useEffect(() => { charger(); }, [charger]);

  const creer = async (e) => {
    e.preventDefault();
    setErreur(""); setNouvelle(null);
    const scopes = ["vehicles:read", "bookings:read", ...(ecriture ? ["vehicles:write"] : [])];
    const { ok, corps } = await appel("/api/api-keys", { method: "POST", body: JSON.stringify({ label, scopes }) });
    if (!ok) return setErreur(corps?.message || "Création impossible.");
    setNouvelle(corps);
    setLabel("");
    charger();
  };

  const revoquer = async (id) => {
    if (!window.confirm("Révoquer cette clé ? Toute intégration qui l'utilise cessera de fonctionner immédiatement.")) return;
    await appel(`/api/api-keys/${id}`, { method: "DELETE" });
    charger();
  };

  if (etat.chargement) return <p className={styles.attente}>Chargement…</p>;
  if (!etat.ok) {
    return (
      <Verrou
        titre="Accès API"
        message={`${etat.message} L'API permet de synchroniser votre parc et vos disponibilités depuis votre propre logiciel de gestion, sans ressaisie.`}
      />
    );
  }

  const { cles = [] } = etat;
  return (
    <>
      <p className={styles.info}>
        Base : <code className={styles.code}>{etat.baseUrl}</code> — authentification par en-tête{" "}
        <code className={styles.code}>X-API-Key</code>, {API_RATE_LIMIT_PER_HOUR} appels par heure et par clé.
      </p>

      {nouvelle && (
        <div className={styles.succes}>
          <p><strong>Clé « {nouvelle.cle.label} » créée.</strong></p>
          <p><code className={styles.code}>{nouvelle.secret}</code></p>
          <p className={styles.avis}>{nouvelle.avis}</p>
        </div>
      )}

      {cles.length > 0 && (
        <div className={styles.tableauEnveloppe}>
          <table className={styles.tableau}>
            <thead><tr><th>Nom</th><th>Clé</th><th>Portées</th><th>Dernier appel</th><th>Appels</th><th></th></tr></thead>
            <tbody>
              {cles.map((k) => (
                <tr key={k._id} className={k.revokedAt ? styles.ligneEteinte : undefined}>
                  <td>{k.label}</td>
                  <td><code className={styles.code}>{k.prefixe}</code></td>
                  <td>{k.scopes.join(", ")}</td>
                  <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString("fr-FR") : "jamais"}</td>
                  <td>{k.usageCount}</td>
                  <td>
                    {k.revokedAt
                      ? <span className={styles.eteint}>Révoquée</span>
                      : <button className={styles.btnDanger} onClick={() => revoquer(k._id)}>Révoquer</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className={styles.formulaire} onSubmit={creer}>
        <h3>Créer une clé</h3>
        <div className={styles.champs}>
          <input required placeholder="Nom de la clé (ex. « ERP interne »)" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <label className={styles.caseACocher}>
          <input type="checkbox" checked={ecriture} onChange={(e) => setEcriture(e.target.checked)} />
          Autoriser la mise à jour des disponibilités (écriture)
        </label>
        {erreur && <p className={styles.erreur}>{erreur}</p>}
        <button className={styles.btnPrimaire}>Créer la clé</button>
      </form>

      <details className={styles.doc}>
        <summary>Comment l'utiliser</summary>
        <pre className={styles.pre}>{`curl -H "X-API-Key: VOTRE_CLE" https://vit-auto.com/api/v1/me
curl -H "X-API-Key: VOTRE_CLE" "https://vit-auto.com/api/v1/vehicles?limit=50"
curl -H "X-API-Key: VOTRE_CLE" "https://vit-auto.com/api/v1/bookings?status=confirmed"

curl -X PATCH -H "X-API-Key: VOTRE_CLE" -H "Content-Type: application/json" \\
     -d '{"available": false}' \\
     https://vit-auto.com/api/v1/vehicles/ID/availability`}</pre>
      </details>
    </>
  );
}

// ── Assistance ─────────────────────────────────────────────────────────────
function Assistance({ appel }) {
  const [etat, setEtat] = useState({ chargement: true });
  const [form, setForm] = useState({ subject: "", category: "other", content: "" });
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [ouvert, setOuvert] = useState(null);

  const charger = useCallback(async () => {
    const { ok, corps } = await appel("/api/support/tickets");
    setEtat({ chargement: false, ok, ...corps });
  }, [appel]);

  useEffect(() => { charger(); }, [charger]);

  const envoyer = async (e) => {
    e.preventDefault();
    setOccupe(true); setErreur("");
    const { ok, corps } = await appel("/api/support/tickets", { method: "POST", body: JSON.stringify(form) });
    setOccupe(false);
    if (!ok) return setErreur(corps?.message || "Envoi impossible.");
    setForm({ subject: "", category: "other", content: "" });
    charger();
  };

  if (etat.chargement) return <p className={styles.attente}>Chargement…</p>;

  const { tickets = [], delaiReponseHeures, prioritaire } = etat;
  return (
    <>
      <p className={prioritaire ? styles.infoAccent : styles.info}>
        {prioritaire
          ? `Assistance prioritaire : première réponse sous ${delaiReponseHeures} h.`
          : `Première réponse sous ${delaiReponseHeures} h. Les formules Business et Exportateur ramènent ce délai à ${PLAN_SUPPORT_SLA_HOURS.business} h et ${PLAN_SUPPORT_SLA_HOURS.exportateur} h, avec passage en tête de file.`}
      </p>

      {tickets.length > 0 && (
        <div className={styles.tableauEnveloppe}>
          <table className={styles.tableau}>
            <thead><tr><th>Objet</th><th>État</th><th>Ouverte le</th><th></th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t._id}>
                  <td>{t.subject}</td>
                  <td>{t.premierRetourFait ? "Réponse reçue" : "En attente"}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td><button className={styles.btnSecondaire} onClick={() => setOuvert(ouvert === t._id ? null : t._id)}>
                    {ouvert === t._id ? "Masquer" : "Voir"}
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ouvert && (
        <div className={styles.fil}>
          {tickets.find((t) => t._id === ouvert)?.messages.map((m, i) => (
            <div key={i} className={m.isAdmin ? styles.messageAdmin : styles.messageAuteur}>
              <strong>{m.auteur}</strong>
              <p>{m.content}</p>
            </div>
          ))}
        </div>
      )}

      <form className={styles.formulaire} onSubmit={envoyer}>
        <h3>Nouvelle demande</h3>
        <div className={styles.champs}>
          <input required placeholder="Objet" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="other">Autre</option>
            <option value="billing">Facturation et abonnement</option>
            <option value="kyc">Vérification d'identité</option>
            <option value="vehicle">Annonces</option>
            <option value="booking">Réservations</option>
            <option value="partner">Dossier partenaire</option>
            <option value="technical">Problème technique</option>
          </select>
        </div>
        <textarea required rows={5} placeholder="Décrivez votre demande" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        {erreur && <p className={styles.erreur}>{erreur}</p>}
        <button className={styles.btnPrimaire} disabled={occupe}>{occupe ? "Envoi…" : "Envoyer au support"}</button>
      </form>
    </>
  );
}
