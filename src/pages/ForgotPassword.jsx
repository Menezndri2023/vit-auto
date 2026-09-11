import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Auth.module.css";

const ForgotPassword = () => {
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [errMsg,   setErrMsg]   = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (!email.trim()) { setErrMsg("Veuillez saisir votre adresse e-mail."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ identifier: email.trim() }),
      });
      await res.json();
      setSent(true);
    } catch {
      setErrMsg("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {sent ? (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>📧</div>
            <h1 className={styles.statutTitre}>E-mail envoyé !</h1>
            <p className={styles.statutTexte}>
              Si un compte est associé à <strong>{email}</strong>, vous recevrez un lien
              de réinitialisation dans quelques minutes. Vérifiez également vos spams.
            </p>
            <Link to="/login" className={`${styles.submitBtn} ${styles.btnLien}`}>
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.logo}>
              <div className={styles.logoIcon}>🔑</div>
              <h1>Mot de passe oublié</h1>
              <p>Saisissez votre adresse e-mail : nous vous enverrons un lien pour réinitialiser votre mot de passe.</p>
            </div>

            {errMsg && (
              <div className={`${styles.encart} ${styles.encartErreur}`} role="alert">
                <p>{errMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                {/* `htmlFor` + `id` : sans eux l'intitulé n'est lié à rien —
                    le clic dessus ne place pas le curseur, et un lecteur
                    d'écran annonce un champ sans nom. */}
                <label htmlFor="forgot-email">Adresse e-mail</label>
                <input id="forgot-email" name="email" type="email" autoComplete="email"
                  placeholder="votre@email.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? "Envoi en cours…" : "Envoyer le lien"}
              </button>
            </form>

            <div className={styles.footerLink}>
              <Link to="/login">← Retour à la connexion</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
