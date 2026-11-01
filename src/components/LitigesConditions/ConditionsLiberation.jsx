import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import styles from "./LitigesConditions.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// Conditions de libération versionnées d'une transaction Import/Export (2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Le serveur fait foi : montant, devise, parties et Incoterm viennent de la
// transaction ; une version est figée, toute modification crée la suivante,
// à réaccepter par l'acheteur ET le vendeur. En règlement direct, ces
// conditions encadrent livraison, conformité et réclamation — pas des fonds.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtMontant = (n, devise) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} ${devise || ""}`.trim());
const jours = (n) => (n == null ? "non défini" : `${n} jour${n > 1 ? "s" : ""}`);

const CHAMPS_VIDES = { lieuNomme: "", modalites: "", conformite: "", documentsRequis: "", delaiValidationJours: "", delaiReclamationJours: "", delaiReponseLitigeJours: "", remboursement: "", liberationPartielle: "" };

export default function ConditionsLiberation({ txId, role, onChange }) {
  const { token } = useAuth();
  const [etat, setEtat] = useState(null);
  const [form, setForm] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const base = `/api/import-export/transactions/${txId}/conditions`;
  const maPartie = role === "client" ? "acheteur" : role === "partner" ? "vendeur" : null;

  const charger = useCallback(async () => {
    const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setEtat(await r.json());
  }, [base, token]);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async (url, corps) => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corps) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Action impossible.");
      setForm(null);
      await charger();
      // L'état du règlement direct dépend des acceptations : la page se recharge.
      onChange?.();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };

  const ouvrirFormulaire = () => {
    const c = etat?.courante?.contenu;
    setForm(c ? {
      lieuNomme: c.livraison?.lieuNomme || "", modalites: c.livraison?.modalites || "", conformite: c.conformite || "",
      documentsRequis: (c.documentsRequis || []).join("\n"), delaiValidationJours: c.delaiValidationJours ?? "",
      delaiReclamationJours: c.delaiReclamationJours ?? "", delaiReponseLitigeJours: c.delaiReponseLitigeJours ?? "",
      remboursement: c.remboursement || "", liberationPartielle: c.liberationPartielle || "",
    } : { ...CHAMPS_VIDES });
  };
  const proposer = () => envoyer(base, {
    livraison: { lieuNomme: form.lieuNomme, modalites: form.modalites },
    conformite: form.conformite,
    documentsRequis: form.documentsRequis.split("\n").map((s) => s.trim()).filter(Boolean),
    delaiValidationJours: form.delaiValidationJours, delaiReclamationJours: form.delaiReclamationJours,
    delaiReponseLitigeJours: form.delaiReponseLitigeJours, remboursement: form.remboursement, liberationPartielle: form.liberationPartielle,
  });

  if (!etat) return null;
  const c = etat.courante;
  const dejaAccepte = maPartie && etat.acceptations?.[maPartie];
  const champ = (k, label, props = {}) => (
    <div className={`${styles.champ} ${props.pleine ? styles.pleine : ""}`}>
      <label htmlFor={`cl-${k}`}>{label}</label>
      {props.zone
        ? <textarea id={`cl-${k}`} rows={3} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
        : <input id={`cl-${k}`} type={props.nombre ? "number" : "text"} min={props.nombre ? 0 : undefined} max={props.nombre ? 365 : undefined}
            inputMode={props.nombre ? "numeric" : undefined} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />}
    </div>
  );

  return (
    <section className={styles.bloc} aria-labelledby="titre-conditions">
      <h3 id="titre-conditions" className={styles.titre}>📜 Conditions de livraison et de réclamation</h3>
      <p className={styles.note}>
        Règlement direct : ces conditions encadrent la livraison, la conformité et les réclamations entre l'acheteur et le vendeur.
        Elles doivent être acceptées par les deux parties avant que l'acheteur puisse déclarer son règlement ; toute
        modification crée une nouvelle version, à accepter de nouveau par les deux. VIT AUTO ne reçoit, ne conserve,
        ne bloque ni ne libère aucun fonds.
      </p>

      {!c ? (
        <p className={styles.muted}>Aucune condition proposée pour l'instant : proposez-en une version, à accepter par les deux parties avant tout règlement.</p>
      ) : (
        <>
          <p>
            <strong>Version {c.version}</strong>{" "}
            <span className={`${styles.statut} ${etat.accepteeParLesDeux ? styles.statutOk : ""}`}>
              {etat.accepteeParLesDeux ? "Acceptée par les deux parties" : "En attente d'acceptation"}
            </span>
          </p>
          <p className={styles.muted}>
            Acheteur : {etat.acceptations?.acheteur ? `accepté le ${fmtDate(etat.acceptations.acheteur.le)}` : "pas encore accepté"} ·
            Vendeur : {etat.acceptations?.vendeur ? `accepté le ${fmtDate(etat.acceptations.vendeur.le)}` : "pas encore accepté"}
          </p>
          <dl className={styles.clauses}>
            <dt>Montant de l'offre</dt><dd>{fmtMontant(c.contenu.montant, c.contenu.devise)}</dd>
            <dt>Livraison</dt><dd>{[c.contenu.livraison?.incoterm && `${c.contenu.livraison.incoterm} (Incoterms® 2020)`, c.contenu.livraison?.lieuNomme, c.contenu.livraison?.modalites].filter(Boolean).join(" — ") || "—"}</dd>
            <dt>Conformité</dt><dd>{c.contenu.conformite || "—"}</dd>
            <dt>Documents requis</dt><dd>{c.contenu.documentsRequis?.length ? c.contenu.documentsRequis.join(", ") : "—"}</dd>
            <dt>Délai de validation</dt><dd>{jours(c.contenu.delaiValidationJours)}</dd>
            <dt>Délai de réclamation</dt><dd>{jours(c.contenu.delaiReclamationJours)}</dd>
            <dt>Réponse à une réclamation</dt><dd>{jours(c.contenu.delaiReponseLitigeJours)}</dd>
            <dt>Remboursement</dt><dd>{c.contenu.remboursement || "—"}</dd>
            <dt>Rôle de VIT AUTO</dt><dd>{c.contenu.roleVitAuto}</dd>
          </dl>
          <p className={styles.code}>Empreinte SHA-256 : {c.hash}</p>
          {maPartie && !dejaAccepte && (
            <div className={styles.actions}>
              <button type="button" className={styles.bouton} disabled={envoi}
                onClick={() => envoyer(`${base}/accepter`, { version: c.version, hash: c.hash })}>
                Accepter la version {c.version}
              </button>
            </div>
          )}
          {etat.versions?.length > 1 && (
            <>
              <h4 className={styles.sousTitre}>Versions précédentes</h4>
              <ul className={styles.liste}>
                {etat.versions.slice(1).map((v) => (
                  <li key={v.version}>Version {v.version} du {fmtDate(v.creeLe)} — {v.acceptations.length} acceptation(s), conservée telle quelle</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {(maPartie || role === "admin") && !form && (
        <div className={styles.actions}>
          <button type="button" className={styles.boutonSec} onClick={ouvrirFormulaire}>
            {c ? `Proposer une version ${c.version + 1}` : "Proposer des conditions"}
          </button>
        </div>
      )}
      {form && (
        <div>
          <p className={styles.muted}>Montant, devise et Incoterm sont repris de la transaction. Une nouvelle version devra être acceptée par les deux parties.</p>
          <div className={styles.grille}>
            {champ("lieuNomme", "Lieu de livraison convenu")}
            {champ("modalites", "Modalités de livraison")}
            {champ("conformite", "Critères de conformité", { zone: true, pleine: true })}
            {champ("documentsRequis", "Documents requis (un par ligne)", { zone: true, pleine: true })}
            {champ("delaiValidationJours", "Délai de validation (jours)", { nombre: true })}
            {champ("delaiReclamationJours", "Délai de réclamation (jours)", { nombre: true })}
            {champ("delaiReponseLitigeJours", "Délai de réponse à une réclamation (jours)", { nombre: true })}
            {champ("remboursement", "Conditions de remboursement", { zone: true, pleine: true })}
            {champ("liberationPartielle", "Livraison ou règlement partiel", { zone: true, pleine: true })}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.bouton} disabled={envoi} onClick={proposer}>Proposer cette version</button>
            <button type="button" className={styles.boutonSec} onClick={() => setForm(null)}>Annuler</button>
          </div>
        </div>
      )}
      {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
    </section>
  );
}
