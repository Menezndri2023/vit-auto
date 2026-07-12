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

  // ── Étapes : "form" → "otp" (inscription par téléphone uniquement) ──────
  const [step, setStep] = useState("form");

  // Email ou téléphone — un seul des deux (voir contactType).
  const [contactType, setContactType] = useState("email"); // "email" | "phone"

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    contact: "",
    password: "",
    confirmPassword: "",
    role: searchParams.get("role") === "partenaire" ? "partenaire" : "client",
  });

  const [createdUserId, setCreatedUserId] = useState(null);
  const [otp,           setOtp]           = useState("");
  const [otpLoading,    setOtpLoading]    = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpError,      setOtpError]      = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [showPassword,  setShowPassword]  = useState(false);

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const switchContactType = (type) => {
    setContactType(type);
    setForm((prev) => ({ ...prev, contact: "" }));
  };

  // ── Étape 1 : inscription ──────────────────────────────────────
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.contact.trim() || !form.password || !form.firstName || !form.lastName) {
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
      const payload = {
        firstName: form.firstName,
        lastName:  form.lastName,
        password:  form.password,
        role:      form.role,
        ...(contactType === "email" ? { email: form.contact.trim() } : { phone: form.contact.trim() }),
      };
      const result = await register(payload);

      if (contactType === "phone" && result?.phoneVerificationSent) {
        setCreatedUserId(result?._id || result?.id);
        setStep("otp");
      } else {
        success(
          contactType === "phone"
            ? "Compte créé ! Vérification par SMS momentanément indisponible — vous pourrez vérifier votre numéro plus tard."
            : "Inscription réussie ! Vérifiez votre boîte mail pour activer votre compte. Redirection…"
        );
        setTimeout(() => navigate(getDest()), 1500);
      }
    } catch (err) {
      error(err.message || "Impossible de créer votre compte.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Renvoyer le code OTP ────────────────────────────────────────
  const resendOtp = async () => {
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/send-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.contact.trim(), userId: createdUserId }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.message || "Erreur lors de l'envoi du code."); return; }
      success("Nouveau code envoyé !");
      setResendCooldown(60);
    } catch {
      error("Erreur réseau. Réessayez.");
    } finally {
      setResendLoading(false);
    }
  };

  // ── Étape 2 : vérification OTP ────────────────────────────────
  const onVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { error("Entrez le code à 6 chiffres."); return; }
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/verify-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.contact.trim(), userId: createdUserId, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.message || "Code incorrect."); return; }
      success("Téléphone vérifié ! Bienvenue sur VIT AUTO.");
      setTimeout(() => navigate(getDest()), 1200);
    } catch {
      setOtpError("Erreur réseau. Réessayez.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Ignorer la vérification téléphone (passer) ────────────────
  const skipPhoneVerif = () => {
    success("Inscription réussie ! Vous pourrez vérifier votre téléphone plus tard.");
    navigate(getDest());
  };

  // ════════════════════════════════════════════════════════════════
  // RENDU — Étape OTP téléphone
  // ════════════════════════════════════════════════════════════════
  if (step === "otp") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>📱</div>
            <h1>Vérification</h1>
            <p>Confirmez votre numéro de téléphone</p>
          </div>

          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "14px 16px", marginBottom: 18, fontSize: "0.88rem", color: "#1e40af" }}>
            <strong>Code envoyé au :</strong> <span style={{ fontWeight: 700 }}>{form.contact}</span><br />
            <span style={{ opacity: .8 }}>Vérifiez vos SMS. Le code est valable quelques minutes.</span>
          </div>

          <form className={styles.form} onSubmit={onVerifyOtp}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="Code à 6 chiffres"
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
              style={{ letterSpacing: "0.35em", fontSize: "1.4rem", textAlign: "center", fontWeight: 700 }}
              required
            />
            {otpError && <p style={{ color: "#dc2626", fontSize: "0.85rem", margin: 0 }}>{otpError}</p>}

            <button type="submit" className={styles.submitBtn} disabled={otpLoading || otp.length !== 6}>
              {otpLoading ? "Vérification…" : "Confirmer le code →"}
            </button>
          </form>

          <div className={styles.footerLink} style={{ marginTop: 12 }}>
            {resendCooldown > 0 ? (
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Renvoyer dans {resendCooldown}s</span>
            ) : (
              <button
                onClick={resendOtp}
                disabled={resendLoading}
                style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}
              >
                {resendLoading ? "Envoi…" : "📤 Renvoyer le code"}
              </button>
            )}
          </div>

          <div className={styles.footerLink} style={{ marginTop: 6 }}>
            <button
              onClick={skipPhoneVerif}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.83rem" }}
            >
              Ignorer pour l'instant →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDU — Formulaire d'inscription
  // ════════════════════════════════════════════════════════════════
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

          {/* Sélecteur Email / Téléphone — un seul des deux sert d'identifiant */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button type="button" onClick={() => switchContactType("email")}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${contactType === "email" ? "#ff4d2d" : "#e5e9f4"}`,
                background: contactType === "email" ? "#fff5f3" : "#fff",
                color: contactType === "email" ? "#ff4d2d" : "#64748b",
                fontWeight: 700, fontSize: "0.88rem",
              }}>
              📧 Email
            </button>
            <button type="button" onClick={() => switchContactType("phone")}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${contactType === "phone" ? "#ff4d2d" : "#e5e9f4"}`,
                background: contactType === "phone" ? "#fff5f3" : "#fff",
                color: contactType === "phone" ? "#ff4d2d" : "#64748b",
                fontWeight: 700, fontSize: "0.88rem",
              }}>
              📱 Téléphone
            </button>
          </div>

          {contactType === "email" ? (
            <input
              type="email"
              name="contact"
              autoComplete="email"
              value={form.contact}
              onChange={handleChange}
              placeholder="Adresse e-mail *"
              required
            />
          ) : (
            <input
              type="tel"
              name="contact"
              autoComplete="tel"
              value={form.contact}
              onChange={handleChange}
              placeholder="Téléphone (ex : +225 07 00 00 00) *"
              required
            />
          )}

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
