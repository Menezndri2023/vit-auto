import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import styles from "./Auth.module.css";

// Inscription d'un prestataire de la zone Transit (2026-10-07) — uniquement
// avec le lien d'invitation envoyé par VIT AUTO. Sans jeton valide, la page
// ne propose aucun formulaire : l'inscription n'est pas ouverte au public.
export default function TransitInscription() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const jeton = params.get("jeton") || "";
  const [invitation, setInvitation] = useState(null);
  const [etat, setEtat] = useState(jeton ? "chargement" : "invalide");
  const [form, setForm] = useState({ firstName: "", lastName: "", telephone: "", password: "", confirmation: "" });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!jeton) return;
    fetch(`/api/transit/invitation/${encodeURIComponent(jeton)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setInvitation(d); setEtat("pret"); })
      .catch(() => setEtat("invalide"));
  }, [jeton]);

  const maj = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur("");
    if (form.password.length < 8) { setErreur("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (form.password !== form.confirmation) { setErreur("Les mots de passe ne correspondent pas."); return; }
    setEnvoi(true);
    try {
      const r = await fetch("/api/transit/inscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, firstName: form.firstName, lastName: form.lastName, telephone: form.telephone, password: form.password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Inscription impossible.");
      setEtat("fait");
      setTimeout(() => navigate("/login", { state: { from: { pathname: "/transit" } } }), 1500);
    } catch (err) { setErreur(err.message); } finally { setEnvoi(false); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚢</div>
          <h1>Zone Transit VIT AUTO</h1>
          <p>Espace des transitaires, commissionnaires en douane et inspecteurs partenaires de VIT AUTO.</p>
        </div>

        {etat === "chargement" && <p>Vérification de votre invitation…</p>}

        {etat === "invalide" && (
          <div className={`${styles.encart} ${styles.encartErreur}`} role="alert">
            <p>Cette inscription se fait uniquement sur invitation de VIT AUTO. Le lien est invalide, expiré (7 jours) ou déjà utilisé : demandez-en un nouveau à votre contact VIT AUTO.</p>
            <p><Link to="/login">Vous avez déjà un compte ? Connectez-vous</Link></p>
          </div>
        )}

        {etat === "fait" && <p>✅ Compte créé. Redirection vers la connexion…</p>}

        {etat === "pret" && (
          <form className={styles.form} onSubmit={envoyer}>
            <p>Invitation pour <strong>{invitation.raisonSociale}</strong> — identifiant : <strong>{invitation.email}</strong></p>
            {erreur && <div className={`${styles.encart} ${styles.encartErreur}`} role="alert"><p>{erreur}</p></div>}
            <div className={styles.field}>
              <label htmlFor="transit-prenom">Prénom</label>
              <input id="transit-prenom" name="firstName" autoComplete="given-name" value={form.firstName} onChange={maj} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="transit-nom">Nom</label>
              <input id="transit-nom" name="lastName" autoComplete="family-name" value={form.lastName} onChange={maj} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="transit-tel">Téléphone</label>
              <input id="transit-tel" name="telephone" type="tel" autoComplete="tel" value={form.telephone} onChange={maj} placeholder="+225 07 00 00 00 00" />
            </div>
            <div className={styles.field}>
              <label htmlFor="transit-mdp">Mot de passe</label>
              <input id="transit-mdp" name="password" type="password" autoComplete="new-password" value={form.password} onChange={maj} required minLength={8} />
            </div>
            <div className={styles.field}>
              <label htmlFor="transit-mdp2">Confirmer le mot de passe</label>
              <input id="transit-mdp2" name="confirmation" type="password" autoComplete="new-password" value={form.confirmation} onChange={maj} required />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={envoi}>{envoi ? "Création…" : "Créer mon accès"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
