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
        <div className={styles.logo}>🚗 VIT AUTO</div>

        {sent ? (
          <>
            <div style={{ fontSize: "3rem", textAlign: "center", marginBottom: 12 }}>📧</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>E-mail envoyé !</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              Si un compte est associé à <strong>{email}</strong>, vous recevrez un lien
              de réinitialisation dans quelques minutes. Vérifiez également vos spams.
            </p>
            <Link to="/login" className={styles.submitBtn}
              style={{ display: "block", textAlign: "center", marginTop: 24, textDecoration: "none" }}>
              Retour à la connexion
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 8px" }}>Mot de passe oublié</h1>
            <p style={{ textAlign: "center", color: "#64748b", marginBottom: 24 }}>
              Saisissez votre adresse e-mail : nous vous enverrons un lien pour
              réinitialiser votre mot de passe.
            </p>

            {errMsg && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                {errMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label>Adresse e-mail</label>
                <input type="email" placeholder="votre@email.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? "Envoi en cours…" : "Envoyer"}
              </button>
            </form>

            <p className={styles.footerLink} style={{ marginTop: 20 }}>
              <Link to="/login">← Retour à la connexion</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
