import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import GoogleAuthButton from "../components/GoogleAuthButton/GoogleAuthButton";
import { WORLD_COUNTRIES } from "../data/worldCountries";
import { ACTIVITIES, ACTIVITY_LABELS, ENTITY_TYPES, ENTITY_TYPE_LABELS, requiresBusinessDocs } from "../constants/partnerTaxonomy";
import { resolveRequirements } from "../utils/partnerRequirements";
import styles from "./Auth.module.css";

const Register = () => {
  const { register, oauthGoogle, verifyEmailCode, resendEmailCode, user, isAuthenticated } = useAuth();
  const { success, error } = useToast();
  const { countryCode } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
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
    activity: "loueur",
    entityType: "particulier",
  });

  // Pré-remplit avec le pays détecté par IP (CurrencyContext) dès qu'il est
  // connu — l'utilisateur reste libre de le changer avant de soumettre.
  useEffect(() => {
    if (countryCode) setForm((prev) => (prev.country ? prev : { ...prev, country: countryCode }));
  }, [countryCode]);

  const [submitting,   setSubmitting]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Affiche un CTA direct vers /login au lieu d'un simple message d'erreur
  // quand le compte existe déjà (email OU téléphone actif) — un compte
  // SUPPRIMÉ par un admin n'entre jamais dans ce cas (l'e-mail/le téléphone
  // redevient libre, voir authController.deleteUser : suppression réelle,
  // pas un simple drapeau) : cette étape ne peut se déclencher qu'à cause
  // d'un compte réellement encore actif.
  const [duplicateAccount, setDuplicateAccount] = useState(false);

  // Étape de confirmation e-mail par code — bloquante : tant que le code n'est
  // pas validé, l'inscription n'est pas considérée comme terminée (voir
  // authController.verifyEmailCode côté serveur). Google OAuth ne passe jamais
  // par cette étape (email déjà vérifié par Google — voir handleGoogleCredential).
  const [step,          setStep]          = useState("form"); // "form" | "code"
  const [emailCode,     setEmailCode]     = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [resending,     setResending]     = useState(false);

  // Ferme la brèche "rechargement de page pendant l'étape code" : sans ce
  // garde, un rafraîchissement juste après l'inscription (session déjà
  // active — voir register() dans AuthContext, le JWT est délivré tout de
  // suite) réinitialisait ce composant sur l'étape "form" et laissait
  // l'utilisateur reprendre sa navigation ailleurs sans jamais confirmer.
  useEffect(() => {
    if (isAuthenticated && user && user.emailVerified === false) setStep("code");
  }, [isAuthenticated, user]);

  const pendingEmailDisplay = form.email.trim() || user?.email || "";

  // Destination post-inscription : ?redirect= explicite prime toujours, puis
  // location.state.from (posé par PartnerRoute/AdminRoute lors d'une redirection
  // /login → "S'inscrire" — voir Login.jsx, sans ce relais la destination
  // d'origine était perdue et l'utilisateur atterrissait systématiquement sur
  // /dashboard après inscription, bug réel trouvé en audit) ; sinon, la
  // redirection dépend du couple activité/type de compte choisi (voir
  // src/utils/partnerRequirements.js) : un particulier loueur/vendeur/exportateur
  // n'a besoin que du KYC identité, un chauffeur passe par ses documents propres
  // (CV/permis), un professionnel/entreprise/concessionnaire est ensuite dirigé
  // vers son dossier Founding Partner — plus de wizard imposé à tout le monde.
  const redirectParam = searchParams.get("redirect");
  const stateFrom = location.state?.from;
  const fromPage  = typeof stateFrom === "string" ? stateFrom : stateFrom?.pathname;
  const getDest = () => {
    if (redirectParam) return decodeURIComponent(redirectParam);
    if (fromPage) return fromPage;
    if (form.role !== "partenaire") return "/dashboard";
    return resolveRequirements({ activity: form.activity, entityType: form.entityType }).postRegistrationRedirect;
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
    setDuplicateAccount(false);
    try {
      const result = await register({
        firstName:  form.firstName,
        lastName:   form.lastName,
        password:   form.password,
        role:       form.role,
        email:      form.email.trim(),
        phone:      form.phone.trim() || undefined,
        country:    form.country,
        birthDate:  form.birthDate,
        activity:   form.role === "partenaire" ? form.activity : undefined,
        entityType: form.role === "partenaire" ? form.entityType : undefined,
        referralCode: searchParams.get("ref") || undefined,
      });

      // Le compte existe déjà (session active) mais l'inscription n'est pas
      // terminée tant que le code reçu par email n'est pas confirmé — on ne
      // redirige jamais directement vers l'app depuis ce formulaire.
      if (result?.emailVerificationCodeRequired) {
        success(`Compte créé ! Un code de confirmation a été envoyé à ${form.email.trim()}.`);
        setStep("code");
      } else {
        // Compte auto-vérifié (mode développement sans SMTP configuré).
        success("Inscription réussie ! Redirection…");
        setTimeout(() => navigate(getDest()), 1000);
      }
    } catch (err) {
      error(err.message || "Impossible de créer votre compte.");
      if (err.code === "EMAIL_ALREADY_USED" || err.code === "PHONE_ALREADY_USED") {
        setDuplicateAccount(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyCode = async (e) => {
    e.preventDefault();
    if (emailCode.trim().length !== 6) { error("Le code contient 6 chiffres."); return; }
    setCodeSubmitting(true);
    try {
      await verifyEmailCode(emailCode.trim());
      success("Adresse e-mail confirmée ! Redirection…");
      setTimeout(() => navigate(getDest()), 1000);
    } catch (err) {
      error(err.message || "Code incorrect.");
    } finally {
      setCodeSubmitting(false);
    }
  };

  const onResendCode = async () => {
    setResending(true);
    try {
      await resendEmailCode();
      success(`Nouveau code envoyé à ${pendingEmailDisplay}.`);
    } catch (err) {
      error(err.message || "Impossible d'envoyer un nouveau code.");
    } finally {
      setResending(false);
    }
  };

  // Google ne fournit jamais la date de naissance — on exige birthDate/country
  // (déjà dans le formulaire, country pré-rempli par géo-IP) avant d'autoriser
  // ce bouton, pour garder la même vérification 18+ qu'à l'inscription classique
  // (voir oauthGoogleSchema/oauthGoogle côté serveur).
  const googleDisabled = !form.birthDate || !form.country;

  const handleGoogleCredential = async (credential) => {
    if (!credential) { error("Connexion Google annulée ou impossible."); return; }
    setSubmitting(true);
    try {
      const result = await oauthGoogle({
        credential,
        birthDate:  form.birthDate,
        country:    form.country,
        role:       form.role,
        activity:   form.role === "partenaire" ? form.activity : undefined,
        entityType: form.role === "partenaire" ? form.entityType : undefined,
      });
      if (result?.requiresTwoFactor) {
        error("Ce compte a la double authentification activée. Connectez-vous avec votre mot de passe.");
        return;
      }
      success("Inscription réussie ! Redirection…");
      setTimeout(() => navigate(getDest()), 1000);
    } catch (err) {
      error(err.message || "Impossible de continuer avec Google.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "code") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>✉️</div>
            <h1>Confirmez votre e-mail</h1>
            <p>Code envoyé à <strong>{pendingEmailDisplay}</strong> — valable 10 minutes</p>
          </div>

          <form className={styles.form} onSubmit={onVerifyCode}>
            <input
              name="emailCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Code à 6 chiffres"
              style={{ textAlign: "center", letterSpacing: "8px", fontSize: "1.3rem", fontWeight: 700 }}
              autoFocus
              required
            />

            <button type="submit" className={styles.submitBtn} disabled={codeSubmitting || emailCode.length !== 6}>
              {codeSubmitting ? "Vérification…" : "Confirmer mon e-mail"}
            </button>

            <div className={styles.footerLink}>
              <button type="button" onClick={onResendCode} disabled={resending} style={{ background: "none", border: "none", color: "inherit", cursor: resending ? "not-allowed" : "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}>
                {resending ? "Envoi…" : "Renvoyer le code"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

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
            <label htmlFor="register-firstName" className={styles.srOnly}>Prénom</label>
            <input
              id="register-firstName"
              name="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={handleChange}
              placeholder="Prénom *"
              required
            />
            <label htmlFor="register-lastName" className={styles.srOnly}>Nom</label>
            <input
              id="register-lastName"
              name="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={handleChange}
              placeholder="Nom *"
              required
            />
          </div>

          <label htmlFor="register-email" className={styles.srOnly}>Adresse e-mail</label>
          <input
            id="register-email"
            type="email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail *"
            required
          />

          <label htmlFor="register-phone" className={styles.srOnly}>Téléphone</label>
          <input
            id="register-phone"
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
            {WORLD_COUNTRIES.map((c) => (
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
              <select name="activity" value={form.activity} onChange={handleChange} autoComplete="off">
                {ACTIVITIES.map((a) => (
                  <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>
                ))}
              </select>
              <select name="entityType" value={form.entityType} onChange={handleChange} autoComplete="off">
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <small style={{ color: "#8493b0", fontSize: "0.78rem", display: "block", marginTop: -8, marginBottom: 4 }}>
                {form.activity === "chauffeur"
                  ? "📍 En tant que chauffeur, une pièce d'identité, un permis de conduire vérifié et un CV vous seront demandés avant de publier."
                  : requiresBusinessDocs(form.entityType)
                    ? "📍 Une vérification entreprise (documents légaux) sera nécessaire pour publier, en plus de votre pièce d'identité."
                    : "📍 En tant que particulier, seule une vérification d'identité (pièce + selfie) vous sera demandée pour publier."}
              </small>
            </>
          )}

          <div className={styles.divider}>OU</div>
          <GoogleAuthButton
            onCredential={handleGoogleCredential}
            disabled={googleDisabled}
            disabledHint={googleDisabled ? "Renseignez votre date de naissance et votre pays pour continuer avec Google." : null}
          />

          <div className={styles.row}>
            <div style={{ position: "relative" }}>
              <label htmlFor="register-password" className={styles.srOnly}>Mot de passe</label>
              <input
                id="register-password"
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
              <label htmlFor="register-confirmPassword" className={styles.srOnly}>Confirmer le mot de passe</label>
              <input
                id="register-confirmPassword"
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

          {/* Correspondance des mots de passe — feedback instantané, même
              principe que l'indicateur de force ci-dessus. Bug UX corrigé
              (audit) : jusqu'ici la seule façon de savoir que les deux
              mots de passe ne correspondaient pas était de soumettre le
              formulaire et de lire un toast générique. */}
          {form.confirmPassword && (
            <p style={{
              margin: "-8px 0 4px", fontSize: ".78rem", fontWeight: 700,
              color: form.password === form.confirmPassword ? "#10b981" : "#ef4444",
            }}>
              {form.password === form.confirmPassword ? "✓ Les mots de passe correspondent" : "✗ Les mots de passe ne correspondent pas"}
            </p>
          )}

          {duplicateAccount && (
            <div style={{
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10,
              padding: "12px 16px", marginBottom: 12, fontSize: ".88rem", color: "#1e3a8a",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <span>Un compte existe déjà avec ces informations.</span>
              <Link
                to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"}
                style={{ fontWeight: 700, color: "#1d4ed8", alignSelf: "flex-start" }}
              >
                Se connecter →
              </Link>
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
