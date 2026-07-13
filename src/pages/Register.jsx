import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Auth.module.css";

const Register = () => {
  const { register } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: searchParams.get("role") === "partenaire" ? "partenaire" : "client",
  });

  const [submitting,   setSubmitting]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Destination post-inscription : ?redirect= explicite, sinon offre Fondateur, sinon selon le rôle
  const redirectParam = searchParams.get("redirect");
  const planParam      = searchParams.get("plan");
  const getDest = () => {
    if (redirectParam) return decodeURIComponent(redirectParam);
    if (planParam === "fondateur") return "/partner-onboarding";
    return form.role === "partenaire" ? "/vendor/dashboard" : "/dashboard";
  };

  useEffect(() => {
    if (searchParams.get("role") === "partenaire") {
      setForm((prev) => ({ ...prev, role: "partenaire" }));
    }
  }, [searchParams]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password || !form.firstName || !form.lastName) {
      error("Veuillez remplir tous les champs obligatoires."); return;
    }
    if (form.password !== form.confirmPassword) {
      error("Les mots de passe ne correspondent pas."); return;
    }
    if (form.password.length < 8) {
      error("Le mot de passe doit contenir au moins 8 caractères."); return;
    }
    setSubmitting(true);
    try {
      await register({
        firstName: form.firstName,
        lastName:  form.lastName,
        password:  form.password,
        role:      form.role,
        email:     form.email.trim(),
        phone:     form.phone.trim() || undefined,
      });

      success("Inscription réussie ! Vérifiez votre boîte mail pour activer votre compte. Redirection…");
      setTimeout(() => navigate(getDest()), 1500);
    } catch (err) {
      error(err.message || "Impossible de créer votre compte.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚗</div>
          <h1>VIT AUTO</h1>
          <p>Créez votre compte gratuitement</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
          <div className={styles.row}>
            <input
              name="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={handleChange}
              placeholder="Prénom *"
              required
            />
            <input
              name="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={handleChange}
              placeholder="Nom *"
              required
            />
          </div>

          <input
            type="email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail *"
            required
          />

          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            value={form.phone}
            onChange={handleChange}
            placeholder="Téléphone (optionnel, ex : +225 07 00 00 00)"
          />

          <select name="role" value={form.role} onChange={handleChange} autoComplete="off">
            <option value="client">🧑 Client — Louer des véhicules</option>
            <option value="partenaire">🤝 Partenaire — Publier des annonces</option>
          </select>

          <div className={styles.row}>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                placeholder="Mot de passe *"
                required
                minLength="8"
                style={{ width: "100%", boxSizing: "border-box", paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Confirmer *"
                required
                style={{ width: "100%", boxSizing: "border-box", paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Indicateur force mot de passe */}
          {form.password && (
            <div style={{ marginTop: -8, marginBottom: 4 }}>
              {(() => {
                const len   = form.password.length;
                const hasUp = /[A-Z]/.test(form.password);
                const hasNum = /\d/.test(form.password);
                const score = (len >= 8 ? 1 : 0) + (hasUp ? 1 : 0) + (hasNum ? 1 : 0);
                const label = ["Faible", "Moyen", "Fort"][score] || "Faible";
                const color = ["#ef4444", "#f59e0b", "#10b981"][score] || "#ef4444";
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 99 }}>
                      <div style={{ width: `${(score + 1) * 33}%`, height: "100%", background: color, borderRadius: 99, transition: "width .3s" }} />
                    </div>
                    <span style={{ fontSize: ".72rem", color, fontWeight: 700 }}>{label}</span>
                  </div>
                );
              })()}
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? "Création…" : "Créer mon compte"}
          </button>

          <div className={styles.footerLink}>
            <span>Déjà un compte ? </span>
            <Link to="/login">Se connecter</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
