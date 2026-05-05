import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Auth.module.css";

const Login = () => {
  const { login } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [form,        setForm]        = useState({ email: "", password: "" });
  const [loading,     setLoading]     = useState(false);
  const [notVerified, setNotVerified] = useState(null); // email à reverifier
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone,    setResendDone]    = useState(false);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { error("Veuillez remplir tous les champs."); return; }
    setLoading(true);
    setNotVerified(null);
    try {
      const loggedUser = await login({ email: form.email, password: form.password });
      success("Connexion réussie ! Redirection...");
      const role = loggedUser?.role;
      const dest = role === "admin"      ? "/admin"
                 : role === "partenaire" ? "/vendor/dashboard"
                 : "/dashboard";
      setTimeout(() => navigate(dest), 1000);
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setNotVerified(err.email || form.email);
      } else {
        error(err.message || "Identifiants incorrects.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
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
          <p>Connectez-vous à votre espace</p>
        </div>

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
              <button onClick={handleResend} disabled={resendLoading}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>
                {resendLoading ? "Envoi…" : "📤 Renvoyer le lien de vérification"}
              </button>
            )}
          </div>
        )}

        <form className={styles.form} onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail"
            required
          />
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Mot de passe"
            required
            minLength="6"
          />
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
          <div className={styles.footerLink}>
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
          </div>
          <div className={styles.footerLink}>
            <span>Pas encore de compte ? </span>
            <Link to="/register">Créer un compte</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
