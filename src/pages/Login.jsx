import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import GoogleAuthButton from "../components/GoogleAuthButton/GoogleAuthButton";
import styles from "./Auth.module.css";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const Login = () => {
  // `t` d'abord : useDocumentMeta le lit, et lire une const déclarée plus bas
  // plante toute la page (règle vit/lecture-avant-declaration).
  const { t } = useI18n();

  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  useDocumentMeta({
    title: t("login.title"),
    description: t("login.metaDesc"),
    traduite: true,
  });

  const { login, oauthGoogle, verifyTwoFactor } = useAuth();
  const { success, error } = useToast();
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

  // ── Challenge 2FA (compte avec le 2FA activé) ──────────────────
  const [twoFaChallenge, setTwoFaChallenge] = useState(null); // { challengeToken }
  const [twoFaCode,      setTwoFaCode]      = useState("");
  const [twoFaVerifying, setTwoFaVerifying] = useState(false);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.identifier || !form.password) { error(t("login.fillAll")); return; }
    setLoading(true);
    setNotVerified(null);
    try {
      const result = await login({ identifier: form.identifier, password: form.password });
      // Bug réel corrigé ici : ce cas n'était jamais vérifié — un compte avec
      // le 2FA activé recevait un message "Connexion réussie" trompeur sans
      // qu'aucune session réelle ne soit ouverte, et sans aucun moyen de saisir
      // son code (voir AuthContext.login/verifyTwoFactor).
      if (result?.requiresTwoFactor) {
        setTwoFaChallenge({ challengeToken: result.challengeToken });
        return;
      }
      success(t("login.success"));
      redirectAfterAuth(result?.role);
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

  const onVerifyTwoFa = async (e) => {
    e.preventDefault();
    if (!twoFaCode.trim()) { error(t("login.enter2fa")); return; }
    setTwoFaVerifying(true);
    try {
      const loggedUser = await verifyTwoFactor({ challengeToken: twoFaChallenge.challengeToken, token: twoFaCode.trim() });
      success(t("login.success"));
      redirectAfterAuth(loggedUser?.role);
    } catch (err) {
      error(err.message || "Code invalide.");
    } finally {
      setTwoFaVerifying(false);
    }
  };

  const redirectAfterAuth = (role) => {
    // Admin → accueil du site (le bouton ⚙️ Admin dans la Navbar permet d'accéder au panel)
    // Partenaire → tableau de bord partenaire ; Client → accueil
    const defaultDest = role === "partenaire" ? "/vendor/dashboard" : "/";
    const dest = fromPage || defaultDest;
    setTimeout(() => navigate(dest + fromSearch, { replace: true }), 900);
  };

  const handleGoogleCredential = async (credential) => {
    if (!credential) { error(t("login.googleCancel")); return; }
    setLoading(true);
    try {
      const result = await oauthGoogle({ credential });
      if (result?.requiresTwoFactor) {
        error(t("login.google2fa"));
        return;
      }
      success(t("login.success"));
      redirectAfterAuth(result?.role);
    } catch (err) {
      if (err.code === "OAUTH_NO_ACCOUNT") {
        error(t("login.googleNoAcct"));
        setTimeout(() => navigate("/register"), 1200);
      } else {
        error(err.message || t("login.googleError"));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error(data.message || t("login.sendError"));
      } else {
        setResendDone(true);
      }
    } catch {
      error(t("login.sendError"));
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
          <p>{t("auth.loginSubtitle")}</p>
        </div>

        {/* Bloc redirection depuis page protégée */}
        {fromPage && !notVerified && (
          <div className={`${styles.encart} ${styles.encartInfo}`}>
            <p>
              {t("login.gateIntro")}{" "}
              <strong>{fromPage === "/vendor" || fromPage === "/vendor/dashboard" ? t("login.gatePartner")
                      : fromPage.startsWith("/booking") ? t("login.gateBooking")
                      : fromPage === "/profile" ? t("login.gateProfile")
                      : t("login.gatePage")}</strong>.
            </p>
          </div>
        )}

        {/* Bloc email non vérifié */}
        {notVerified && (
          <div className={`${styles.encart} ${styles.encartAttention}`}>
            <p className={styles.encartTitre}>📧 {t("auth.verifyEmail")}</p>
            <p>{t("login.notVerified", { email: notVerified })}</p>
            {resendDone ? (
              <p className={styles.encartSucces}>{t("login.linkSent")}</p>
            ) : (
              <button type="button" onClick={handleResendEmail} disabled={resendLoading} className={styles.encartBtn}>
                {resendLoading ? t("login.sending") : t("login.resendLink")}
              </button>
            )}
          </div>
        )}

        {twoFaChallenge ? (
          <form className={styles.form} onSubmit={onVerifyTwoFa} autoComplete="off">
            <div className={`${styles.encart} ${styles.encartInfo}`}>
              <p>{t("login.2faIntro")}</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="login-2fa">{t("login.2faLabel")}</label>
              <input
                id="login-2fa"
                type="text"
                inputMode="text"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                placeholder={t("login.2faPh")}
                autoFocus
                required
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={twoFaVerifying}>
              {twoFaVerifying ? t("common.loading") : t("login.verify")}
            </button>
            <div className={styles.footerLink}>
              <button type="button" onClick={() => { setTwoFaChallenge(null); setTwoFaCode(""); }}>
                {t("login.back")}
              </button>
            </div>
          </form>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
            {/* La connexion Google est placée AVANT le formulaire : c'est le
                chemin le plus court, et elle n'a besoin d'aucune saisie
                préalable. Elle était jusqu'ici reléguée sous le bouton
                d'envoi, après le formulaire qu'elle sert justement à éviter. */}
            <GoogleAuthButton onCredential={handleGoogleCredential} />
            <div className={styles.divider}>{t("login.orCreds")}</div>

            <div className={styles.field}>
              <label htmlFor="login-identifier">{t("login.identifier")}</label>
              <input
                id="login-identifier"
                type="text"
                name="identifier"
                autoComplete="username"
                value={form.identifier}
                onChange={handleChange}
                placeholder={t("login.emailPh")}
                required
              />
            </div>

            <div className={styles.pwField}>
              <label htmlFor="login-password">{t("auth.password")}</label>
              <div className={styles.pwWrap}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  minLength="8"
                />
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className={styles.pwToggle}
                  aria-label={showPassword ? t("login.hidePwd") : t("login.showPwd")}>
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? t("common.loading") : t("auth.loginBtn")}
            </button>

            <div className={styles.footerLink}>
              <Link to="/forgot-password">{t("auth.forgotPwd")}</Link>
            </div>
            <div className={styles.footerLink}>
              <span>{t("auth.noAccount")}</span>
              {/* Relaie la destination d'origine (page protégée qui a redirigé vers
                  /login) — sans ce state, Register.jsx la perdait entièrement,
                  renvoyant systématiquement vers /dashboard après inscription. */}
              <Link to="/register" state={fromPage ? { from: { pathname: fromPage, search: fromSearch } } : undefined}>
                {t("auth.registerBtn")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
