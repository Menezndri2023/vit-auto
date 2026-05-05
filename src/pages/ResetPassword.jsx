import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import styles from "./Auth.module.css";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token    = searchParams.get("token");

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [errMsg,    setErrMsg]    = useState("");
  const [showPass,  setShowPass]  = useState(false);

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>🚗 VIT AUTO</div>
          <div style={{ fontSize: "3rem", textAlign: "center", marginBottom: 12 }}>⚠️</div>
          <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Lien invalide</h1>
          <p style={{ textAlign: "center", color: "#64748b" }}>
            Ce lien est incomplet ou corrompu. Recommencez la procédure depuis la page de connexion.
          </p>
          <Link to="/forgot-password" className={styles.submitBtn}
            style={{ display: "block", textAlign: "center", marginTop: 24, textDecoration: "none" }}>
            Redemander un lien
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (password.length < 6) { setErrMsg("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setErrMsg("Les mots de passe ne correspondent pas."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur.");
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setErrMsg(err.message || "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🚗 VIT AUTO</div>

        {success ? (
          <>
            <div style={{ fontSize: "3rem", textAlign: "center", marginBottom: 12 }}>✅</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Mot de passe modifié !</h1>
            <p style={{ textAlign: "center", color: "#64748b" }}>
              Votre mot de passe a été réinitialisé. Redirection vers la connexion…
            </p>
          </>
        ) : (
          <>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 8px" }}>Nouveau mot de passe</h1>
            <p style={{ textAlign: "center", color: "#64748b", marginBottom: 24 }}>
              Choisissez un mot de passe sécurisé d'au moins 6 caractères.
            </p>

            {errMsg && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                {errMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label>Nouveau mot de passe</label>
                <div style={{ position: "relative" }}>
                  <input type={showPass ? "text" : "password"} placeholder="Minimum 6 caractères"
                    value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
                    style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPass((p) => !p)}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>Confirmer le mot de passe</label>
                <input type={showPass ? "text" : "password"} placeholder="Retapez le mot de passe"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? "Réinitialisation…" : "Enregistrer le nouveau mot de passe"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
