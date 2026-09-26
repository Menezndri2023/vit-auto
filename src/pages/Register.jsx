import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import GoogleAuthButton from "../components/GoogleAuthButton/GoogleAuthButton";
import { WORLD_COUNTRIES } from "../data/worldCountries";
import { ACTIVITIES, ACTIVITY_LABELS, ENTITY_TYPES, ENTITY_TYPE_LABELS, requiresBusinessDocs } from "../constants/partnerTaxonomy";
import { resolveRequirements } from "../utils/partnerRequirements";
import { libelleTraduit } from "../i18n/libelles";
import styles from "./Auth.module.css";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const Register = () => {
  // `t` d'abord : useDocumentMeta le lit, et lire une const déclarée plus bas
  // plante toute la page (règle vit/lecture-avant-declaration).
  const { t } = useI18n();

  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  useDocumentMeta({
    title: t("reg.title"),
    description: t("reg.metaDesc"),
    traduite: true,
  });

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
    rccm:       "",
  });

  // Pré-remplit avec le pays détecté par IP (CurrencyContext) dès qu'il est
  // connu — l'utilisateur reste libre de le changer avant de soumettre.
  useEffect(() => {
    if (countryCode) setForm((prev) => (prev.country ? prev : { ...prev, country: countryCode }));
  }, [countryCode]);

  // Le bouton Google exige la date de naissance et le pays. Grisé, il avalait
  // le clic sans rien dire ; il amène désormais au champ qui manque.
  const champDateRef = useRef(null);
  const champPaysRef = useRef(null);
  const allerAuChampManquant = () => {
    const cible = (!form.birthDate ? champDateRef : champPaysRef).current;
    if (!cible) return;
    cible.scrollIntoView({ behavior: "smooth", block: "center" });
    cible.focus({ preventScroll: true });
  };

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
      error(t("reg.fillRequired")); return;
    }
    if (form.password !== form.confirmPassword) {
      error(t("reg.pwdMismatch")); return;
    }
    if (form.password.length < 8) {
      error(t("reg.pwdTooShort")); return;
    }
    if (form.role === "partenaire" && requiresBusinessDocs(form.entityType) && !form.rccm.trim()) {
      error(t("reg.rcRequired")); return;
    }
    const age = (Date.now() - new Date(form.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 18) {
      error(t("reg.under18")); return;
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
        rccm: form.role === "partenaire" && requiresBusinessDocs(form.entityType) ? form.rccm.trim() : undefined,
        referralCode: searchParams.get("ref") || undefined,
      });

      // Le compte existe déjà (session active) mais l'inscription n'est pas
      // terminée tant que le code reçu par email n'est pas confirmé — on ne
      // redirige jamais directement vers l'app depuis ce formulaire.
      if (result?.emailVerificationCodeRequired) {
        success(t("reg.codeSentToast", { email: form.email.trim() }));
        setStep("code");
      } else {
        // Compte auto-vérifié (mode développement sans SMTP configuré).
        success(t("reg.success"));
        setTimeout(() => navigate(getDest()), 1000);
      }
    } catch (err) {
      error(err.message || t("reg.cannotCreate"));
      if (err.code === "EMAIL_ALREADY_USED" || err.code === "PHONE_ALREADY_USED") {
        setDuplicateAccount(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyCode = async (e) => {
    e.preventDefault();
    if (emailCode.trim().length !== 6) { error(t("reg.code6Chars")); return; }
    setCodeSubmitting(true);
    try {
      await verifyEmailCode(emailCode.trim());
      success(t("reg.emailOk"));
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
      error(err.message || t("reg.noNewCode"));
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
    if (!credential) { error(t("login.googleCancel")); return; }
    setSubmitting(true);
    try {
      const result = await oauthGoogle({
        credential,
        birthDate:  form.birthDate,
        country:    form.country,
        role:       form.role,
        activity:   form.role === "partenaire" ? form.activity : undefined,
        entityType: form.role === "partenaire" ? form.entityType : undefined,
        rccm: form.role === "partenaire" && requiresBusinessDocs(form.entityType) ? form.rccm.trim() : undefined,
      });
      if (result?.requiresTwoFactor) {
        error(t("login.google2fa"));
        return;
      }
      success(t("reg.success"));
      setTimeout(() => navigate(getDest()), 1000);
    } catch (err) {
      error(err.message || t("reg.googleFail"));
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
            <h1>{t("reg.confirmEmail")}</h1>
            <p>{t("reg.codeSentTo")} <strong>{pendingEmailDisplay}</strong> {t("reg.codeValid")}</p>
          </div>

          <form className={styles.form} onSubmit={onVerifyCode}>
            <div className={styles.field}>
              <label htmlFor="register-code">{t("reg.code6")}</label>
              <input
                id="register-code"
                name="emailCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                style={{ textAlign: "center", letterSpacing: "8px", fontSize: "1.3rem", fontWeight: 700 }}
                autoFocus
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={codeSubmitting || emailCode.length !== 6}>
              {codeSubmitting ? t("reg.verifying") : t("reg.confirmMyEmail")}
            </button>

            <div className={styles.footerLink}>
              <button type="button" onClick={onResendCode} disabled={resending}>
                {resending ? "Envoi…" : t("reg.resendCode")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const forceMotDePasse = (() => {
    const mdp = form.password;
    const score = (mdp.length >= 8 ? 1 : 0) + (/[A-Z]/.test(mdp) ? 1 : 0) + (/\d/.test(mdp) ? 1 : 0);
    return {
      score,
      texte:   ["Faible", "Faible", "Moyen", "Fort"][score],
      couleur: ["#ef4444", "#ef4444", "#f59e0b", "#10b981"][score],
    };
  })();

  return (
    <div className={styles.page}>
      <div className={`${styles.card} ${styles.cardLarge}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚗</div>
          <h1>VIT AUTO</h1>
          <p>{t("reg.subtitle")}</p>
        </div>

        {/* Raccourci Google en tête : c'est le chemin le plus court vers un
            compte. Il était jusqu'ici coincé au MILIEU du formulaire, entre
            les champs partenaire et les mots de passe — donc découvert après
            avoir rempli la moitié de ce qu'il permet justement d'éviter. */}
        {/* Google ne transmet ni la date de naissance ni le pays : plutôt
            qu'un bouton grisé renvoyant vers des champs deux écrans plus bas
            (téléphone), les deux champs manquants s'affichent JUSTE sous le
            bouton, liés aux mêmes valeurs que le formulaire complet. */}
        <div className={styles.googleBloc}>
          <GoogleAuthButton
            onCredential={handleGoogleCredential}
            disabled={googleDisabled}
            onDisabledClick={allerAuChampManquant}
          />
          {googleDisabled && (
            <div className={styles.googleChamps}>
              <p className={styles.googleNote}>{t("reg.googleNeeds")}</p>
              <div className={styles.row}>
                {!form.birthDate && (
                  <div className={styles.field}>
                    <label htmlFor="google-birthDate">{t("reg.birthDate")}</label>
                    <input
                      id="google-birthDate"
                      type="date"
                      name="birthDate"
                      autoComplete="bday"
                      value={form.birthDate}
                      onChange={handleChange}
                      max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                    />
                  </div>
                )}
                {!form.country && (
                  <div className={styles.field}>
                    <label htmlFor="google-country">{t("auth.country")}</label>
                    <select id="google-country" name="country" value={form.country} onChange={handleChange} autoComplete="country">
                      <option value="" disabled>{t("reg.pickCountry")}</option>
                      {WORLD_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className={styles.hint}>{t("reg.googleProfile")}.</p>
            </div>
          )}
        </div>
        <div className={styles.divider}>{t("reg.orForm")}</div>

        <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>{t("reg.yourIdentity")}</legend>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="register-firstName">{t("auth.firstName")} <span className={styles.requis}>*</span></label>
                <input
                  id="register-firstName"
                  name="firstName"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={handleChange}
                  placeholder="Awa"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="register-lastName">Nom <span className={styles.requis}>*</span></label>
                <input
                  id="register-lastName"
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={handleChange}
                  placeholder={t("reg.lastNamePh")}
                  required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="register-birthDate">{t("reg.birthDate")} <span className={styles.requis}>*</span></label>
                <input
                  id="register-birthDate"
                  ref={champDateRef}
                  type="date"
                  name="birthDate"
                  autoComplete="bday"
                  value={form.birthDate}
                  onChange={handleChange}
                  max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                  required
                />
                <p className={styles.hint}>{t("reg.min18")}</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="register-country">{t("auth.country")} <span className={styles.requis}>*</span></label>
                <select
                  id="register-country"
                  ref={champPaysRef}
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  autoComplete="country"
                  required
                >
                  <option value="" disabled>{t("reg.pickCountry")}</option>
                  {WORLD_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
                <p className={styles.hint}>{t("reg.birthHint")}</p>
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>{t("reg.yourContact")}</legend>

            <div className={styles.field}>
              <label htmlFor="register-email">Adresse e-mail <span className={styles.requis}>*</span></label>
              <input
                id="register-email"
                type="email"
                name="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder={t("login.emailPh")}
                required
              />
              <p className={styles.hint}>{t("reg.codeHint")}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="register-phone">{t("auth.phone")} <span style={{ color: "#94a3b8", fontWeight: 600 }}>{t("reg.optional")}</span></label>
              <input
                id="register-phone"
                type="tel"
                name="phone"
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+225 07 00 00 00 00"
              />
            </div>
          </fieldset>

          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>{t("reg.youAre")}</legend>

            {/* C'était un menu déroulant : le choix le plus structurant de
                l'inscription — il change la nature du compte et fait
                apparaître trois champs — était caché derrière un contrôle
                qu'il fallait ouvrir pour voir les deux options. */}
            <div className={styles.choix} role="radiogroup" aria-label={t("reg.accountType")}>
              {[
                { valeur: "client",     titre: t("reg.roleClient"),  desc: t("reg.roleClientDesc") },
                { valeur: "partenaire", titre: t("reg.rolePartner"), desc: t("reg.publishAds") },
              ].map((option) => (
                <label
                  key={option.valeur}
                  className={`${styles.choixOption} ${form.role === option.valeur ? styles.choixActif : ""}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.valeur}
                    checked={form.role === option.valeur}
                    onChange={handleChange}
                  />
                  <span className={styles.choixTitre}>{option.titre}</span>
                  <span className={styles.choixDesc}>{option.desc}</span>
                </label>
              ))}
            </div>

            {form.role === "partenaire" && (
              <>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="register-activity">{t("reg.yourBusiness")}</label>
                    <select id="register-activity" name="activity" value={form.activity} onChange={handleChange} autoComplete="off">
                      {ACTIVITIES.map((a) => (
                        <option key={a} value={a}>{libelleTraduit(t, "metier", a, ACTIVITY_LABELS)}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="register-entityType">{t("reg.entityType")}</label>
                    <select id="register-entityType" name="entityType" value={form.entityType} onChange={handleChange} autoComplete="off">
                      {ENTITY_TYPES.map((type) => (
                        <option key={type} value={type}>{libelleTraduit(t, "entite", type, ENTITY_TYPE_LABELS)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Registre de Commerce — demandé dès l'inscription pour toute
                    entité qui exerce au nom d'une société. Un particulier n'en a
                    pas : le champ n'apparaît pas pour lui plutôt que d'être
                    affiché puis ignoré. */}
                {requiresBusinessDocs(form.entityType) && (
                  <div className={styles.field}>
                    <label htmlFor="register-rccm">{t("reg.rcNumber")} <span className={styles.requis}>*</span></label>
                    <input
                      id="register-rccm"
                      name="rccm"
                      value={form.rccm}
                      onChange={handleChange}
                      placeholder="CI-ABJ-2024-B-12345"
                      autoComplete="off"
                      maxLength={60}
                    />
                  </div>
                )}

                <p className={styles.hint}>
                  {form.activity === "chauffeur"
                    ? t("reg.noteDriver")
                    : requiresBusinessDocs(form.entityType)
                      ? t("reg.noteCompany")
                      : t("reg.notePerson")}
                </p>
              </>
            )}
          </fieldset>

          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>{t("reg.security")}</legend>

            {/* Les deux mots de passe étaient côte à côte : sur téléphone comme
                sur ordinateur, chaque champ tombait sous 200 px alors qu'il
                faut y lire une saisie masquée. Ils sont désormais empilés. */}
            <div className={styles.pwField}>
              <label htmlFor="register-password">{t("auth.password")} <span className={styles.requis}>*</span></label>
              <div className={styles.pwWrap}>
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder={t("reg.pwdMin")}
                  required
                  minLength="8"
                />
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className={styles.pwToggle}
                  aria-label={showPassword ? t("login.hidePwd") : t("login.showPwd")}>
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {form.password && (
                <div className={styles.force}>
                  <div className={styles.forceRail}>
                    <div className={styles.forceBarre}
                      style={{ width: `${forceMotDePasse.score * 33.3 + 1}%`, background: forceMotDePasse.couleur }} />
                  </div>
                  <span className={styles.forceTexte} style={{ color: forceMotDePasse.couleur }}>
                    {forceMotDePasse.texte}
                  </span>
                </div>
              )}
              <p className={styles.hint}>{t("reg.pwdRule")}</p>
            </div>

            <div className={styles.pwField}>
              <label htmlFor="register-confirmPassword">{t("reg.pwdConfirm")} <span className={styles.requis}>*</span></label>
              <div className={styles.pwWrap}>
                <input
                  id="register-confirmPassword"
                  type={showPassword ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder={t("reg.pwdRetype")}
                  required
                />
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className={styles.pwToggle}
                  aria-label={showPassword ? t("login.hidePwd") : t("login.showPwd")}>
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {/* Feedback instantané : jusqu'ici la seule façon de savoir que
                  les deux mots de passe différaient était de soumettre le
                  formulaire et de lire un toast générique. */}
              {form.confirmPassword && (
                <p className={`${styles.concordance} ${form.password === form.confirmPassword ? styles.concordanceOk : styles.concordanceNon}`}>
                  {form.password === form.confirmPassword ? t("reg.pwdMatch") : t("reg.pwdNoMatch")}
                </p>
              )}
            </div>
          </fieldset>

          {duplicateAccount && (
            <div className={`${styles.encart} ${styles.encartInfo}`}>
              <p>{t("reg.exists")}</p>
              <Link
                className={styles.encartLien}
                to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"}
              >
                Se connecter →
              </Link>
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? t("reg.creating") : t("reg.createBtn")}
          </button>

          <div className={styles.footerLink}>
            <span>{t("auth.haveAccount")}</span>
            <Link to="/login">{t("auth.loginBtn")}</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
