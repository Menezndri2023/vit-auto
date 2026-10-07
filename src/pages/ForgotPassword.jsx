import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./Auth.module.css";

const ForgotPassword = () => {
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [errMsg,   setErrMsg]   = useState("");
  // Le téléphone n'est proposé que si le serveur a les SMS allumés.
  const [smsDispo, setSmsDispo] = useState(false);
  useEffect(() => {
    fetch("/api/auth/canaux").then((r) => (r.ok ? r.json() : null))
      .then((d) => setSmsDispo(!!d?.sms)).catch(() => {});
  }, []);
  const parTelephone = smsDispo && !!email.trim() && !email.includes("@");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (!email.trim()) { setErrMsg(smsDispo ? "Veuillez saisir votre adresse e-mail ou votre numéro." : "Veuillez saisir votre adresse e-mail."); return; }

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
            <div className={styles.statutIcone}>{parTelephone ? "📱" : "📧"}</div>
            <h1 className={styles.statutTitre}>{parTelephone ? "Code envoyé !" : "E-mail envoyé !"}</h1>
            <p className={styles.statutTexte}>
              {parTelephone
                ? <>Si un compte est associé au <strong>{email}</strong>, vous allez recevoir un code par SMS.</>
                : <>Si un compte est associé à <strong>{email}</strong>, vous recevrez un lien
                  de réinitialisation dans quelques minutes. Vérifiez également vos spams.</>}
            </p>
            {parTelephone ? (
              <Link to={`/reset-password?phone=${encodeURIComponent(email.trim())}`} className={`${styles.submitBtn} ${styles.btnLien}`}>
                Saisir le code reçu
              </Link>
            ) : (
              <Link to="/login" className={`${styles.submitBtn} ${styles.btnLien}`}>
                Retour à la connexion
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className={styles.logo}>
              <div className={styles.logoIcon}>🔑</div>
              <h1>Mot de passe oublié</h1>
              <p>{smsDispo
                ? "Saisissez votre adresse e-mail (lien de réinitialisation) ou, si votre compte n'en a pas, votre numéro de téléphone (code SMS)."
                : "Saisissez votre adresse e-mail : nous vous enverrons un lien pour réinitialiser votre mot de passe."}</p>
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
                <label htmlFor="forgot-email">{smsDispo ? "E-mail ou téléphone" : "Adresse e-mail"}</label>
                <input id="forgot-email" name="email" type={smsDispo ? "text" : "email"} autoComplete={smsDispo ? "username" : "email"}
                  placeholder={smsDispo ? "votre@email.com ou +212 6…" : "votre@email.com"} value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? "Envoi en cours…" : parTelephone ? "Recevoir un code" : "Envoyer le lien"}
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
