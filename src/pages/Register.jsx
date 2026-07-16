import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Auth.module.css";

const Register = () => {
  const { register } = useAuth();
  const { success, error } = useToast();
  const { countryCode, COUNTRIES_CONFIG } = useCurrency();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    password: "",
    confirmPassword: "",
    country: "",
    role: searchParams.get("role") === "partenaire" ? "partenaire" : "client",
    // Un lien "?plan=fondateur" (page Partenaires.jsx) cible explicitement le
    // programme Founding Partner, pensé pour des sociétés — sans ce défaut,
    // un candidat arrivant par ce lien et ne touchant pas au sélecteur (valeur
    // par défaut "particulier") aurait été redirigé vers /vendor au lieu du
    // programme qu'il est venu rejoindre (voir getDest ci-dessous).
    sellerType: searchParams.get("plan") === "fondateur" ? "entreprise" : "particulier",
  });

  // Pré-remplit avec le pays détecté par IP (CurrencyContext) dès qu'il est
  // connu — l'utilisateur reste libre de le changer avant de soumettre.
  useEffect(() => {
    if (countryCode) setForm((prev) => (prev.country ? prev : { ...prev, country: countryCode }));
  }, [countryCode]);

  const [submitting,   setSubmitting]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Destination post-inscription : ?redirect= explicite, sinon offre Fondateur
  // (entreprise/professionnel uniquement — programme pensé pour des sociétés),
  // sinon selon le rôle. Un partenaire "particulier" n'a rien à faire dans le
  // programme Founding Partner (RCCM, IBAN, export...) : direction la publication
  // d'annonce, où seule une vérification d'identité KYC lui sera demandée.
  const redirectParam = searchParams.get("redirect");
  const planParam      = searchParams.get("plan");
  const getDest = () => {
    if (redirectParam) return decodeURIComponent(redirectParam);
    if (form.role === "partenaire" && form.sellerType === "particulier") return "/vendor";
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
    if (!form.email.trim() || !form.password || !form.firstName || !form.lastName || !form.country || !form.birthDate) {
      error("Veuillez remplir tous les champs obligatoires."); return;
    }
    if (form.password !== form.confirmPassword) {
      error("Les mots de passe ne correspondent pas."); return;
    }
    if (form.password.length < 8) {
      error("Le mot de passe doit contenir au moins 8 caractères."); return;
    }
    const age = (Date.now() - new Date(form.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 18) {
      error("Vous devez avoir au moins 18 ans pour créer un compte VIT AUTO."); return;
    }
    setSubmitting(true);
    try {
      await register({
        firstName:  form.firstName,
        lastName:   form.lastName,
        password:   form.password,
        role:       form.role,
        email:      form.email.trim(),
        phone:      form.phone.trim() || undefined,
        country:    form.country,
        birthDate:  form.birthDate,
        sellerType: form.role === "partenaire" ? form.sellerType : undefined,
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

          <label style={{ display: "block", fontSize: "0.82rem", color: "#4a5876", marginBottom: 4 }}>
            Date de naissance * <span style={{ color: "#94a3b8" }}>(vous devez avoir 18 ans ou plus)</span>
          </label>
          <input
            type="date"
            name="birthDate"
            autoComplete="bday"
            value={form.birthDate}
            onChange={handleChange}
            max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
            required
          />

          <select name="country" value={form.country} onChange={handleChange} autoComplete="country" required>
            <option value="" disabled>Pays *</option>
            {COUNTRIES_CONFIG.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
          <small style={{ color: "#8493b0", fontSize: "0.78rem", display: "block", marginTop: -8, marginBottom: 4 }}>
            📍 Utilisé pour vous montrer les annonces de votre pays.
          </small>

          <select name="role" value={form.role} onChange={handleChange} autoComplete="off">
            <option value="client">🧑 Client — Louer des véhicules</option>
            <option value="partenaire">🤝 Partenaire — Publier des annonces</option>
          </select>

          {form.role === "partenaire" && (
            <>
              <select name="sellerType" value={form.sellerType} onChange={handleChange} autoComplete="off">
                <option value="particulier">🧑 Particulier — Je vends/loue mon propre véhicule</option>
                <option value="professionnel">🏢 Professionnel — Agent, chauffeur indépendant...</option>
                <option value="entreprise">🏛️ Entreprise — Société de location/vente</option>
              </select>
              <small style={{ color: "#8493b0", fontSize: "0.78rem", display: "block", marginTop: -8, marginBottom: 4 }}>
                {form.sellerType === "particulier"
                  ? "📍 En tant que particulier, seule une vérification d'identité (pièce + selfie) vous sera demandée pour publier."
                  : "📍 Une vérification entreprise (documents légaux) sera nécessaire pour publier."}
              </small>
            </>
          )}

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
