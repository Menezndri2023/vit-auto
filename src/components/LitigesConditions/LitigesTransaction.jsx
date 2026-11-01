import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import styles from "./LitigesConditions.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// Réclamations (litiges) d'une transaction Import/Export (2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Une réclamation ne change ni le statut de la transaction, ni le règlement,
// ni la logistique, et ne bloque aucun fonds : l'écran ne le laisse jamais
// entendre. L'équipe VIT AUTO l'instruit ; l'issue est une décision écrite.

const MOTIFS = [
  ["non_recu", "Marchandise non reçue"], ["endommage", "Marchandise endommagée"], ["non_conforme", "Produit non conforme"],
  ["quantite_incorrecte", "Quantité incorrecte"], ["documents_manquants", "Documents manquants"], ["retard_important", "Retard important"],
  ["paiement_conteste", "Paiement contesté"], ["autre", "Autre motif"],
];
const LIBELLE_MOTIF = Object.fromEntries(MOTIFS);
const ETATS = {
  opened: "Ouverte", evidence_requested: "Pièces demandées", under_review: "En cours d'examen",
  resolved: "Décision rendue", rejected: "Rejetée", closed: "Close",
};
const SUIVANTS = {
  opened: ["evidence_requested", "under_review"], evidence_requested: ["under_review"],
  under_review: ["evidence_requested", "resolved", "rejected"], resolved: ["closed"], rejected: ["closed"], closed: [],
};
const LIBELLE_ACTION = { evidence_requested: "Demander des pièces", under_review: "Passer en examen", resolved: "Rendre une décision", rejected: "Rejeter", closed: "Clore" };
const PARTIE = { acheteur: "Acheteur", vendeur: "Vendeur", admin: "VIT AUTO" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const MAX_MO = 8;

const lireFichier = (fichier) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ko(new Error("Lecture du fichier impossible."));
  r.readAsDataURL(fichier);
});

function Litige({ litige, role, appeler }) {
  const [texte, setTexte] = useState("");
  const [decision, setDecision] = useState({ vers: null, decision: "", justification: "", note: "" });
  const ouvert = litige.etat !== "closed";

  const deposer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) return appeler(null, null, "Formats acceptés : image ou PDF.");
    if (f.size > MAX_MO * 1024 * 1024) return appeler(null, null, `Fichier trop lourd (${MAX_MO} Mo au plus).`);
    appeler(`/api/import-export/litiges/${litige._id}/pieces`, { nom: f.name, fichier: await lireFichier(f) });
  };
  const exigeDecision = decision.vers === "resolved" || decision.vers === "rejected";

  return (
    <article className={`${styles.litige} ${ouvert ? styles.litigeOuvert : ""}`}>
      <p>
        <strong>{litige.reference}</strong> — {LIBELLE_MOTIF[litige.motif] || litige.motif}{" "}
        <span className={`${styles.statut} ${litige.etat === "closed" ? styles.statutClos : ""}`}>{ETATS[litige.etat] || litige.etat}</span>
      </p>
      <p className={styles.muted}>Ouverte le {fmtDate(litige.ouvertLe)} par : {PARTIE[litige.partieOuvrante]} · Réponse attendue : {litige.echeanceReponse ? `avant le ${fmtDate(litige.echeanceReponse)}` : "échéance non définie"}</p>
      <p>{litige.description}</p>
      {litige.contexte?.fondsLiberes && (
        <p className={styles.note}>Le règlement a déjà été effectué entre les parties : VIT AUTO ne détient pas ces fonds et ne peut pas les récupérer.</p>
      )}
      {litige.issue?.decision && (
        <div className={styles.note}><strong>Décision de VIT AUTO :</strong> {litige.issue.decision}<br /><strong>Justification :</strong> {litige.issue.justification}</div>
      )}

      {litige.pieces?.length > 0 && (
        <>
          <h4 className={styles.sousTitre}>Pièces</h4>
          <ul className={styles.liste}>
            {litige.pieces.map((p) => <li key={p._id}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.nom}</a> — {PARTIE[p.partie]}, {fmtDate(p.le)}</li>)}
          </ul>
        </>
      )}
      {litige.messages?.length > 0 && (
        <>
          <h4 className={styles.sousTitre}>Échanges</h4>
          <ul className={styles.liste}>
            {litige.messages.map((m) => <li key={m._id}><strong>{PARTIE[m.partie]}</strong> ({fmtDate(m.le)}) : {m.texte}</li>)}
          </ul>
        </>
      )}

      {ouvert && (
        <>
          <div className={styles.grille}>
            <div className={`${styles.champ} ${styles.pleine}`}>
              <label htmlFor={`msg-${litige._id}`}>Votre message</label>
              <textarea id={`msg-${litige._id}`} rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.boutonSec} disabled={!texte.trim()}
              onClick={() => { appeler(`/api/import-export/litiges/${litige._id}/messages`, { texte }); setTexte(""); }}>Envoyer</button>
            <label className={styles.boutonSec} style={{ position: "relative", overflow: "hidden" }}>
              Joindre une pièce (image ou PDF)
              <input type="file" accept="image/*,application/pdf" onChange={deposer} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            </label>
          </div>
        </>
      )}

      {role === "admin" && SUIVANTS[litige.etat]?.length > 0 && (
        <>
          <h4 className={styles.sousTitre}>Instruction (VIT AUTO)</h4>
          <div className={styles.actions}>
            {SUIVANTS[litige.etat].map((v) => (
              <button key={v} type="button" className={styles.boutonSec} onClick={() => setDecision((d) => ({ ...d, vers: v }))}>{LIBELLE_ACTION[v]}</button>
            ))}
          </div>
          {decision.vers && (
            <div className={styles.grille}>
              {exigeDecision && (
                <>
                  <div className={`${styles.champ} ${styles.pleine}`}>
                    <label htmlFor={`dec-${litige._id}`}>Décision</label>
                    <textarea id={`dec-${litige._id}`} rows={2} value={decision.decision} onChange={(e) => setDecision((d) => ({ ...d, decision: e.target.value }))} />
                  </div>
                  <div className={`${styles.champ} ${styles.pleine}`}>
                    <label htmlFor={`jus-${litige._id}`}>Justification</label>
                    <textarea id={`jus-${litige._id}`} rows={3} value={decision.justification} onChange={(e) => setDecision((d) => ({ ...d, justification: e.target.value }))} />
                  </div>
                </>
              )}
              <div className={`${styles.champ} ${styles.pleine}`}>
                <label htmlFor={`note-${litige._id}`}>Note interne (facultative)</label>
                <input id={`note-${litige._id}`} value={decision.note} onChange={(e) => setDecision((d) => ({ ...d, note: e.target.value }))} />
              </div>
              <div className={`${styles.actions} ${styles.pleine}`}>
                <button type="button" className={styles.bouton}
                  disabled={exigeDecision && (!decision.decision.trim() || !decision.justification.trim())}
                  onClick={() => { appeler(`/api/import-export/litiges/${litige._id}/etat`, decision, null, "PATCH"); setDecision({ vers: null, decision: "", justification: "", note: "" }); }}>
                  Confirmer : {LIBELLE_ACTION[decision.vers]}
                </button>
                <button type="button" className={styles.boutonSec} onClick={() => setDecision({ vers: null, decision: "", justification: "", note: "" })}>Annuler</button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function LitigesTransaction({ txId, role, ouvrable }) {
  const { token } = useAuth();
  const [litiges, setLitiges] = useState(null);
  const [form, setForm] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const r = await fetch(`/api/import-export/transactions/${txId}/litiges`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setLitiges((await r.json()).litiges || []);
  }, [txId, token]);
  useEffect(() => { charger(); }, [charger]);

  // url null + message : erreur locale (fichier refusé avant envoi).
  const appeler = async (url, corps, messageLocal = null, methode = "POST") => {
    if (!url) { setErreur(messageLocal); return; }
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(url, { method: methode, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corps) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Action impossible.");
      setForm(null);
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };

  if (litiges === null) return null;
  const enCours = litiges.find((l) => l.etat !== "closed");
  if (!litiges.length && !ouvrable) return null;

  return (
    <section className={styles.bloc} aria-labelledby="titre-litiges" aria-busy={envoi}>
      <h3 id="titre-litiges" className={styles.titre}>⚖️ Réclamations</h3>
      <p className={styles.muted}>
        Une réclamation est instruite par l'équipe VIT AUTO avec les deux parties. Elle ne modifie pas le suivi de la
        transaction et ne bloque aucun fonds.
      </p>
      {litiges.map((l) => <Litige key={l._id} litige={l} role={role} appeler={appeler} />)}

      {ouvrable && !enCours && !form && (
        <div className={styles.actions}>
          <button type="button" className={styles.boutonSec} onClick={() => setForm({ motif: "non_conforme", description: "" })}>Ouvrir une réclamation</button>
        </div>
      )}
      {form && (
        <div className={styles.grille}>
          <div className={styles.champ}>
            <label htmlFor="lit-motif">Motif</label>
            <select id="lit-motif" value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}>
              {MOTIFS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className={`${styles.champ} ${styles.pleine}`}>
            <label htmlFor="lit-desc">Décrivez le problème</label>
            <textarea id="lit-desc" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className={`${styles.actions} ${styles.pleine}`}>
            <button type="button" className={styles.bouton} disabled={envoi || form.description.trim().length < 10}
              onClick={() => appeler(`/api/import-export/transactions/${txId}/litiges`, form)}>Ouvrir la réclamation</button>
            <button type="button" className={styles.boutonSec} onClick={() => setForm(null)}>Annuler</button>
          </div>
        </div>
      )}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
    </section>
  );
}
