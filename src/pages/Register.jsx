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

  // ── Étapes : "form" → "otp" → "done" ─────────────────────────
  const [step, setStep] = useState("form");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: searchParams.get("role") === "partenaire" ? "partenaire" : "client",
  });

  const [createdUser, setCreatedUser]   = useState(null);
  const [otp, setOtp]                   = useState("");
  const [otpLoading, setOtpLoading]     = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devOtp, setDevOtp]             = useState(null);
  const [submitting, setSubmitting]     = useState(false);

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

  // Compte à rebours renvoyer code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // ── Étape 1 : inscription ──────────────────────────────────────
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.firstName || !form.lastName) {
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
      const result = await register(form);
      setCreatedUser(result || null);

      // Si le téléphone est fourni → étape vérification OTP
      if (form.phone?.trim()) {
        await sendOtp(result?._id || result?.id, form.phone, true);
      } else {
        success("Inscription réussie ! Redirection...");
        setTimeout(() => navigate(getDest()), 1500);
      }
    } catch (err) {
      error(err.message || "Impossible de créer votre compte.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Envoyer/renvoyer OTP ───────────────────────────────────────
  const sendOtp = async (userId, phone, initial = false) => {
    if (!initial) setResendLoading(true);
    try {
      const res = await fetch("/api/auth/send-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone || form.phone, userId }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.message || "Erreur lors de l'envoi du code."); return; }
      if (data.devOtp) setDevOtp(data.devOtp);
      if (initial) {
        setStep("otp");
        success("Code de vérification envoyé sur votre téléphone.");
      } else {
        success("Nouveau code envoyé !");
        setResendCooldown(60);
      }
    } catch {
      error("Erreur réseau. Réessayez.");
    } finally {
      if (!initial) setResendLoading(false);
    }
  };

  // ── Étape 2 : vérification OTP ────────────────────────────────
  const onVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { error("Entrez le code à 6 chiffres."); return; }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/verify-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, userId: createdUser?._id || createdUser?.id, otp }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.message || "Code incorrect."); return; }
      success("Téléphone vérifié ! Bienvenue sur VIT AUTO.");
      setTimeout(() => navigate(getDest()), 1200);
    } catch {
      error("Erreur réseau. Réessayez.");
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
            <strong>Code envoyé au :</strong> <span style={{ fontWeight: 700 }}>{form.phone}</span><br />
            <span style={{ opacity: .8 }}>Vérifiez vos SMS. Le code est valable 10 minutes.</span>
            {devOtp && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "#fef3c7", borderRadius: 8, color: "#92400e", fontWeight: 700 }}>
                🛠 [DEV] Code : {devOtp}
              </div>
            )}
          </div>

          <form className={styles.form} onSubmit={onVerifyOtp}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="Code à 6 chiffres"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ letterSpacing: "0.35em", fontSize: "1.4rem", textAlign: "center", fontWeight: 700 }}
              required
            />

            <button type="submit" className={styles.submitBtn} disabled={otpLoading || otp.length !== 6}>
              {otpLoading ? "Vérification…" : "Confirmer le code →"}
            </button>
          </form>

          <div className={styles.footerLink} style={{ marginTop: 12 }}>
            {resendCooldown > 0 ? (
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Renvoyer dans {resendCooldown}s</span>
            ) : (
              <button
                onClick={() => sendOtp(createdUser?._id || createdUser?.id, form.phone)}
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

          <input
            type="email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail *"
            required
          />

          <div style={{ position: "relative" }}>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="Téléphone (ex : +225 07 00 00 00) *"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: ".75rem", color: "#10b981", fontWeight: 600, pointerEvents: "none" }}>
              {form.phone ? "📱 OTP" : ""}
            </span>
          </div>
          <p style={{ margin: "-8px 0 4px", fontSize: "0.78rem", color: "#64748b" }}>
            📲 Un code de vérification sera envoyé par SMS si vous renseignez votre téléphone.
          </p>

          <select name="role" value={form.role} onChange={handleChange} autoComplete="off">
            <option value="client">🧑 Client — Louer des véhicules</option>
            <option value="partenaire">🤝 Partenaire — Publier des annonces</option>
          </select>

          <div className={styles.row}>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              placeholder="Mot de passe *"
              required
              minLength="8"
            />
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Confirmer *"
              required
            />
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
