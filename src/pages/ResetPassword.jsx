import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import styles from "./Auth.module.css";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token    = searchParams.get("token");
  // Réinitialisation par SMS (compte sans e-mail) : /reset-password?phone=…
  const phone    = searchParams.get("phone");
  const [otp, setOtp] = useState("");

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [errMsg,    setErrMsg]    = useState("");
  const [showPass,  setShowPass]  = useState(false);

  if (!token && !phone) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.statut}>
            <div className={styles.statutIcone}>⚠️</div>
            <h1 className={styles.statutTitre}>Lien invalide</h1>
            <p className={styles.statutTexte}>
              Ce lien est incomplet ou corrompu. Recommencez la procédure depuis la page de connexion.
            </p>
            <Link to="/forgot-password" className={`${styles.submitBtn} ${styles.btnLien}`}>
              Redemander un lien
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (password.length < 8) { setErrMsg("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (password !== confirm) { setErrMsg("Les mots de passe ne correspondent pas."); return; }
    if (!token && otp.length !== 6) { setErrMsg("Saisissez le code à 6 chiffres reçu par SMS."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(token ? { token, password } : { phone, otp, password }),
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
        {success ? (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>✅</div>
            <h1 className={styles.statutTitre}>Mot de passe modifié !</h1>
            <p className={styles.statutTexte}>
              Votre mot de passe a été réinitialisé. Redirection vers la connexion…
            </p>
          </div>
        ) : (
          <>
            <div className={styles.logo}>
              <div className={styles.logoIcon}>🔒</div>
              <h1>Nouveau mot de passe</h1>
              <p>Choisissez un mot de passe sécurisé d'au moins 8 caractères.</p>
            </div>

            {errMsg && (
              <div className={`${styles.encart} ${styles.encartErreur}`} role="alert">
                <p>{errMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              {!token && (
                <div className={styles.inputGroup}>
                  <label htmlFor="reset-otp">Code reçu par SMS au {phone}</label>
                  <input id="reset-otp" name="otp" inputMode="numeric" autoComplete="one-time-code"
                    maxLength={6} placeholder="000000" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{ textAlign: "center", letterSpacing: "8px", fontSize: "1.3rem", fontWeight: 700 }} required />
                </div>
              )}
              <div className={styles.pwField}>
                <label htmlFor="reset-password">Nouveau mot de passe</label>
                <div className={styles.pwWrap}>
                  <input id="reset-password" name="password" autoComplete="new-password"
                    type={showPass ? "text" : "password"} placeholder="Minimum 8 caractères"
                    value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!!token} />
                  <button type="button" onClick={() => setShowPass((p) => !p)}
                    className={styles.pwToggle}
                    aria-label={showPass ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className={styles.pwField}>
                <label htmlFor="reset-confirm">Confirmer le mot de passe</label>
                <div className={styles.pwWrap}>
                  <input id="reset-confirm" name="confirmPassword" autoComplete="new-password"
                    type={showPass ? "text" : "password"} placeholder="Retapez le mot de passe"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                  <button type="button" onClick={() => setShowPass((p) => !p)}
                    className={styles.pwToggle}
                    aria-label={showPass ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
                {confirm && (
                  <p className={`${styles.concordance} ${password === confirm ? styles.concordanceOk : styles.concordanceNon}`}>
                    {password === confirm ? "✓ Les mots de passe correspondent" : "✗ Les mots de passe ne correspondent pas"}
                  </p>
                )}
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? "Réinitialisation…" : "Enregistrer le mot de passe"}
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

export default ResetPassword;
