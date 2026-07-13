import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import styles from "./Auth.module.css";

const Login = () => {
  const { login } = useAuth();
  const { success, error } = useToast();
  const { t } = useI18n();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Support React Router state (from protected routes) et les ?returnTo/?redirect URL params (KYC/liens manuels)
  const urlParams  = new URLSearchParams(location.search);
  const returnToParam = urlParams.get("returnTo") || urlParams.get("redirect");
  const stateFrom  = location.state?.from;
  const fromPage   = (typeof stateFrom === "string" ? stateFrom : stateFrom?.pathname)
                      || (returnToParam ? decodeURIComponent(returnToParam) : null);
  const fromSearch = (typeof stateFrom === "object" && stateFrom?.search) || "";

  const [form,           setForm]           = useState({ identifier: "", password: "" });
  const [showPassword,   setShowPassword]   = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [notVerified,    setNotVerified]    = useState(null);      // email non vérifié
  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendDone,     setResendDone]     = useState(false);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.identifier || !form.password) { error("Veuillez remplir tous les champs."); return; }
    setLoading(true);
    setNotVerified(null);
    try {
      const loggedUser = await login({ identifier: form.identifier, password: form.password });
      success("Connexion réussie ! Redirection...");
      const role = loggedUser?.role;
      // Admin → accueil du site (le bouton ⚙️ Admin dans la Navbar permet d'accéder au panel)
      // Partenaire → tableau de bord partenaire
      // Client → accueil
      const defaultDest = role === "partenaire" ? "/vendor/dashboard" : "/";
      const dest = fromPage || defaultDest;
      setTimeout(() => navigate(dest + fromSearch, { replace: true }), 900);
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setNotVerified(err.email || form.identifier);
      } else {
        error(err.message || "Identifiants incorrects.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!notVerified) return;
    setResendLoading(true);
    try {
      const res  = await fetch("/api/auth/resend-verification", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: notVerified }),
      });
      await res.json();
      setResendDone(true);
    } catch {
      error("Erreur lors de l'envoi. Réessayez.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚗</div>
          <h1>VIT AUTO</h1>
          <p>{t("auth.loginSubtitle") || "Connectez-vous à votre espace"}</p>
        </div>

        {/* Bloc redirection depuis page protégée */}
        {fromPage && !notVerified && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#1e40af", fontWeight: 600 }}>
              🔒 Connectez-vous pour accéder à{" "}
              <strong>{fromPage === "/vendor" || fromPage === "/vendor/dashboard" ? "l'espace partenaire"
                      : fromPage.startsWith("/booking") ? "votre réservation"
                      : fromPage === "/profile" ? "votre profil"
                      : "cette page"}</strong>.
            </p>
          </div>
        )}

        {/* Bloc email non vérifié */}
        {notVerified && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#92400e" }}>📧 E-mail non vérifié</p>
            <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "#78350f" }}>
              Votre adresse <strong>{notVerified}</strong> n'a pas encore été confirmée.
              Vérifiez votre boîte mail ou cliquez ci-dessous pour recevoir un nouveau lien.
            </p>
            {resendDone ? (
              <p style={{ margin: 0, color: "#10b981", fontWeight: 600, fontSize: "0.88rem" }}>
                ✅ Lien envoyé ! Vérifiez votre boîte mail.
              </p>
            ) : (
              <button onClick={handleResendEmail} disabled={resendLoading}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>
                {resendLoading ? "Envoi…" : "📤 Renvoyer le lien de vérification"}
              </button>
            )}
          </div>
        )}

        <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
          <input
            type="text"
            name="identifier"
            autoComplete="username"
            value={form.identifier}
            onChange={handleChange}
            placeholder="Email ou téléphone"
            required
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              placeholder={t("auth.password")}
              required
              minLength="8"
              style={{ width: "100%", boxSizing: "border-box", paddingRight: 44 }}
            />
            <button type="button" onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? `${t("common.loading")}` : t("auth.loginBtn")}
          </button>
          <div className={styles.footerLink}>
            <Link to="/forgot-password">{t("auth.forgotPwd")}</Link>
          </div>
          <div className={styles.footerLink}>
            <span>{t("auth.noAccount") || "Pas encore de compte ? "}</span>
            <Link to="/register">{t("auth.registerBtn")}</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
