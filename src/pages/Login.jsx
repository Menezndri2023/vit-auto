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

  // Support both React Router state (from protected routes) and ?returnTo URL param (from KYC/manual links)
  const urlParams  = new URLSearchParams(location.search);
  const returnToParam = urlParams.get("returnTo");
  const fromPage   = location.state?.from?.pathname || (returnToParam ? decodeURIComponent(returnToParam) : null);
  const fromSearch = location.state?.from?.search || "";

  const [form,           setForm]           = useState({ email: "", password: "" });
  const [loading,        setLoading]        = useState(false);
  const [notVerified,    setNotVerified]    = useState(null);      // email non vérifié
  const [phoneNotVerif,  setPhoneNotVerif]  = useState(null);      // { phone, userId }
  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendDone,     setResendDone]     = useState(false);

  // OTP téléphone
  const [otp,          setOtp]          = useState("");
  const [otpLoading,   setOtpLoading]   = useState(false);
  const [devOtp,       setDevOtp]       = useState(null);
  const [resendPhone,  setResendPhone]  = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { error("Veuillez remplir tous les champs."); return; }
    setLoading(true);
    setNotVerified(null);
    setPhoneNotVerif(null);
    try {
      const loggedUser = await login({ email: form.email, password: form.password });
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
        setNotVerified(err.email || form.email);
      } else if (err.code === "PHONE_NOT_VERIFIED") {
        setPhoneNotVerif({ phone: err.phone, userId: err.userId });
        // Envoyer automatiquement le code OTP
        sendPhoneOtp(err.phone, err.userId, true);
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

  const sendPhoneOtp = async (phone, userId, auto = false) => {
    if (!auto) setResendPhone(true);
    try {
      const res = await fetch("/api/auth/send-phone-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone, userId }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.message); return; }
      if (data.devOtp) setDevOtp(data.devOtp);
      if (!auto) { success("Nouveau code OTP envoyé !"); setPhoneCooldown(60); }
    } catch {
      error("Erreur réseau.");
    } finally {
      if (!auto) setResendPhone(false);
    }
  };

  const onVerifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { error("Entrez le code à 6 chiffres."); return; }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/verify-phone-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: phoneNotVerif?.phone, userId: phoneNotVerif?.userId, otp }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.message || "Code incorrect."); return; }
      success("Téléphone vérifié ! Reconnexion...");
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      error("Erreur réseau.");
    } finally {
      setOtpLoading(false);
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
        {fromPage && !notVerified && !phoneNotVerif && (
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

        {/* Bloc téléphone non vérifié */}
        {phoneNotVerif && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#166534" }}>📱 Vérification téléphone requise</p>
            <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "#15803d" }}>
              Un code a été envoyé au <strong>{phoneNotVerif.phone}</strong>.<br />
              Entrez-le ci-dessous pour accéder à votre compte.
            </p>

            {devOtp && (
              <div style={{ marginBottom: 10, padding: "6px 10px", background: "#fef3c7", borderRadius: 8, color: "#92400e", fontWeight: 700, fontSize: "0.85rem" }}>
                🛠 [DEV] Code OTP : {devOtp}
              </div>
            )}

            <form onSubmit={onVerifyPhoneOtp} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Code 6 chiffres"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{
                  flex: 1, minWidth: 120, padding: "10px 14px",
                  border: "1.5px solid #86efac", borderRadius: 10,
                  fontSize: "1.1rem", letterSpacing: "0.3em",
                  textAlign: "center", fontWeight: 700,
                }}
              />
              <button type="submit" disabled={otpLoading || otp.length !== 6}
                style={{ padding: "10px 18px", background: "#10b981", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}>
                {otpLoading ? "…" : t("auth.validate")}
              </button>
            </form>

            <div style={{ marginTop: 10, fontSize: "0.82rem" }}>
              {phoneCooldown > 0 ? (
                <span style={{ color: "#94a3b8" }}>Renvoyer dans {phoneCooldown}s</span>
              ) : (
                <button onClick={() => sendPhoneOtp(phoneNotVerif.phone, phoneNotVerif.userId)} disabled={resendPhone}
                  style={{ background: "none", border: "none", color: "#059669", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" }}>
                  {resendPhone ? "Envoi…" : "📤 Renvoyer le code"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Formulaire de connexion (caché si OTP téléphone en attente) */}
        {!phoneNotVerif && (
          <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              placeholder={t("auth.email")}
              required
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              placeholder={t("auth.password")}
              required
              minLength="8"
            />
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
        )}

        {phoneNotVerif && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              onClick={() => { setPhoneNotVerif(null); setOtp(""); }}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.83rem" }}
            >
              ← {t("auth.backToLogin")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
