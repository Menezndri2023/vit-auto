import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Auth.module.css";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [errMsg,   setErrMsg]   = useState("");

  // Étape 2 (téléphone uniquement) : code OTP + nouveau mot de passe
  const [otp,             setOtp]             = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [resetLoading,    setResetLoading]    = useState(false);
  const [resetDone,       setResetDone]       = useState(false);

  const isPhone = !identifier.includes("@");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (!identifier.trim()) { setErrMsg("Veuillez saisir votre email ou votre numéro de téléphone."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ identifier: identifier.trim() }),
      });
      await res.json();
      setSent(true);
    } catch {
      setErrMsg("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithOtp = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (otp.length !== 6) { setErrMsg("Entrez le code à 6 chiffres."); return; }
    if (newPassword.length < 8) { setErrMsg("Le mot de passe doit contenir au moins 8 caractères."); return; }

    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: identifier.trim(), otp, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setErrMsg(data.message || "Code invalide ou expiré."); return; }
      setResetDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch {
      setErrMsg("Erreur réseau. Réessayez.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🚗 VIT AUTO</div>

        {resetDone ? (
          <>
            <div style={{ fontSize: "3rem", textAlign: "center", marginBottom: 12 }}>✅</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Mot de passe modifié !</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>Redirection vers la connexion…</p>
          </>
        ) : sent && isPhone ? (
          <>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 8px" }}>Code envoyé par SMS</h1>
            <p style={{ textAlign: "center", color: "#64748b", marginBottom: 24 }}>
              Si un compte est associé à <strong>{identifier}</strong>, un code de vérification a été envoyé.
              Entrez-le ci-dessous avec votre nouveau mot de passe.
            </p>

            {errMsg && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                {errMsg}
              </div>
            )}

            <form onSubmit={handleResetWithOtp} className={styles.form}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                placeholder="Code à 6 chiffres" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ letterSpacing: "0.35em", fontSize: "1.4rem", textAlign: "center", fontWeight: 700 }}
                required
              />
              <input
                type="password" placeholder="Nouveau mot de passe" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} minLength={8} required
              />
              <button type="submit" className={styles.submitBtn} disabled={resetLoading || otp.length !== 6}>
                {resetLoading ? "Validation…" : "Réinitialiser le mot de passe"}
              </button>
            </form>

            <p className={styles.footerLink} style={{ marginTop: 20 }}>
              <Link to="/login">← Retour à la connexion</Link>
            </p>
          </>
        ) : sent ? (
          <>
            <div style={{ fontSize: "3rem", textAlign: "center", marginBottom: 12 }}>📧</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>E-mail envoyé !</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              Si un compte est associé à <strong>{identifier}</strong>, vous recevrez un lien
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
              Saisissez votre email ou votre numéro de téléphone : nous vous enverrons un lien
              ou un code pour réinitialiser votre mot de passe.
            </p>

            {errMsg && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                {errMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label>Email ou téléphone</label>
                <input type="text" placeholder="votre@email.com ou +225 07 00 00 00" value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
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
