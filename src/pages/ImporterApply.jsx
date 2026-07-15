import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./ImporterApply.module.css";
import { COUNTRIES_ALL, CITIES_CI, CITIES_AFRIQUE, PARTNER_REFERENCES } from "../data/autocomplete";

const ACTIVITY_OPTIONS = [
  { value: "import",           label: "Importation" },
  { value: "export",           label: "Exportation" },
  { value: "transit",          label: "Transit / Commissionnaire" },
  { value: "courtage",         label: "Courtage automobile" },
  { value: "pieces_detachees", label: "Pièces détachées" },
];

const VEHICLE_CATEGORIES = [
  "Berlines", "SUV / 4x4", "Pick-up", "Utilitaires", "Camions", "Minibus",
  "Véhicules électriques", "Luxe / Premium", "Motos", "Pièces détachées",
];

const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => res(r.result);
    r.onerror = rej;
  });

const STEPS = ["Entreprise", "Documents", "Activité", "Récapitulatif"];

export default function ImporterApply() {
  const { user, isAuthenticated, token } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // ── Données formulaire ────────────────────────────────────────────────────
  const [company, setCompany] = useState({
    companyName: user?.business?.companyName || "",
    rccm: user?.business?.rccm || "",
    taxId: user?.business?.taxId || "",
    operatingLicense: "",
    address: user?.business?.address || "",
    city: user?.defaultLocation?.city || "",
    country: "Côte d'Ivoire",
    website: "",
  });

  const [docs, setDocs] = useState({
    rccmImage: null,
    taxIdImage: null,
    licenseImage: null,
    companyLogo: null,
    bankStatement: null,
  });
  const [docPreviews, setDocPreviews] = useState({});

  const [activity, setActivity] = useState({
    activityType: ["import"],
    operatingCountries: [],
    vehicleCategories: [],
    annualVolume: "",
    yearsExperience: "",
    references: "",
    description: "",
  });

  const countryInput = useState("")[0];
  const [countryText, setCountryText] = useState("");

  // ── Handlers ──────────────────────────────────────────────────────────────
  const setC = (k, v) => setCompany((s) => ({ ...s, [k]: v }));
  const setA = (k, v) => setActivity((s) => ({ ...s, [k]: v }));

  const toggleActivity = (val) => {
    setActivity((s) => ({
      ...s,
      activityType: s.activityType.includes(val)
        ? s.activityType.filter((x) => x !== val)
        : [...s.activityType, val],
    }));
  };

  const toggleCategory = (val) => {
    setActivity((s) => ({
      ...s,
      vehicleCategories: s.vehicleCategories.includes(val)
        ? s.vehicleCategories.filter((x) => x !== val)
        : [...s.vehicleCategories, val],
    }));
  };

  const addCountry = () => {
    const c = countryText.trim();
    if (c && !activity.operatingCountries.includes(c)) {
      setA("operatingCountries", [...activity.operatingCountries, c]);
    }
    setCountryText("");
  };

  const handleDoc = useCallback(async (key, file) => {
    if (!file) return;
    const b64 = await toBase64(file);
    setDocs((d) => ({ ...d, [key]: b64 }));
    setDocPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
  }, []);

  // ── Soumission ─────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!isAuthenticated) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...company,
        documents: docs,
        activityType: activity.activityType,
        operatingCountries: activity.operatingCountries,
        vehicleCategories: activity.vehicleCategories,
        annualVolume: activity.annualVolume,
        yearsExperience: activity.yearsExperience ? Number(activity.yearsExperience) : 0,
        references: activity.references,
        description: activity.description,
      };

      const res = await fetch("/api/import-export/importer-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur serveur");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [company, docs, activity, isAuthenticated, token]);


  // ── Succès ─────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.successWrap}>
          <div className={styles.successIcon}>🎉</div>
          <h2>Candidature soumise !</h2>
          <p>Notre équipe examine votre dossier sous <strong>48–72h ouvrables</strong>.<br />Vous recevrez une notification dès qu'une décision sera prise.</p>
          <div className={styles.successBtns}>
            <Link to="/importer-dashboard" className={styles.btnPrimary}>Mon espace importateur</Link>
            <Link to="/" className={styles.btnGhost}>Retour à l'accueil</Link>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* Header */}
        <div className={styles.pageHeader}>
          <span className={styles.headerBadge}>🌍 PARTENAIRE IMPORTATEUR</span>
          <h1>Candidature importateur agréé</h1>
          <p>Faites reconnaître votre entreprise comme importateur/exportateur agréé sur VIT AUTO — badge de confiance affiché sur votre profil public.</p>
        </div>

        {/* La publication d'annonces Import/Export exige le programme Founding
            Partner (KYC + entreprise + LOI/Accord signés) depuis que celui-ci
            a été introduit — cette candidature seule, même approuvée, ne
            débloque jamais la publication. Le header promettait auparavant le
            contraire ("publiez vos véhicules..."), ce qui était faux. */}
        <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.6rem" }}>⚠️</span>
          <div>
            <strong style={{ display: "block", marginBottom: 4, color: "#92400e" }}>Cette candidature ne donne pas accès à la publication</strong>
            <p style={{ margin: "0 0 10px", color: "#92400e", fontSize: ".88rem" }}>
              Elle vous attribue un badge "Partenaire vérifié" affiché sur votre profil public, mais seul le
              <strong> programme Founding Partner</strong> (vérification complète : identité, entreprise, LOI et Accord signés)
              permet de publier des annonces Import/Export sur VIT AUTO.
            </p>
            <Link to="/partner-onboarding" style={{ display: "inline-block", padding: "8px 18px", background: "#f59e0b", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".85rem" }}>
              Rejoindre le programme Founding Partner →
            </Link>
          </div>
        </div>

        {/* Stepper */}
        <div className={styles.stepper}>
          {STEPS.map((s, i) => (
            <div key={s} className={`${styles.stepItem} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}>
              <div className={styles.stepCircle}>{i < step ? "✓" : i + 1}</div>
              <span className={styles.stepLabel}>{s}</span>
              {i < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        <div className={styles.formCard}>

          {/* ── Datalists autocomplete (partagés entre étapes) ── */}
          <datalist id="dl-apply-countries">
            {COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="dl-apply-cities">
            {[...CITIES_CI, ...CITIES_AFRIQUE].filter((v, i, a) => a.indexOf(v) === i).map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="dl-apply-references">
            {PARTNER_REFERENCES.map((r) => <option key={r} value={r} />)}
          </datalist>

          {/* ── ÉTAPE 0 : Entreprise ── */}
          {step === 0 && (
            <div className={styles.formSection}>
              <h2 className={styles.stepTitle}>Informations sur l'entreprise</h2>
              <div className={styles.grid2}>
                <label>
                  <span>Nom de l'entreprise *</span>
                  <input autoComplete="organization" value={company.companyName} onChange={(e) => setC("companyName", e.target.value)} placeholder="VIT AUTO Imports SARL" />
                </label>
                <label>
                  <span>Site web</span>
                  <input type="url" autoComplete="url" value={company.website} onChange={(e) => setC("website", e.target.value)} placeholder="https://www.monentreprise.ci" />
                </label>
              </div>
              <div className={styles.grid2}>
                <label>
                  <span>N° RCCM</span>
                  <input value={company.rccm} onChange={(e) => setC("rccm", e.target.value)} placeholder="CI-ABJ-2020-B-00123" />
                </label>
                <label>
                  <span>NIF / Identifiant fiscal</span>
                  <input value={company.taxId} onChange={(e) => setC("taxId", e.target.value)} placeholder="0000000A" />
                </label>
              </div>
              <label>
                <span>Agrément importateur (référence)</span>
                <input value={company.operatingLicense} onChange={(e) => setC("operatingLicense", e.target.value)} placeholder="Numéro d'agrément ou licence" />
              </label>
              <div className={styles.grid2}>
                <label>
                  <span>Adresse</span>
                  <input autoComplete="street-address" value={company.address} onChange={(e) => setC("address", e.target.value)} placeholder="Rue des Jardins, Zone 4" />
                </label>
                <label>
                  <span>Ville</span>
                  <input list="dl-apply-cities" autoComplete="address-level2" value={company.city} onChange={(e) => setC("city", e.target.value)} placeholder="Abidjan" />
                </label>
              </div>
              <label>
                <span>Pays</span>
                <input list="dl-apply-countries" autoComplete="country-name" value={company.country} onChange={(e) => setC("country", e.target.value)} placeholder="Côte d'Ivoire" />
              </label>
            </div>
          )}

          {/* ── ÉTAPE 1 : Documents ── */}
          {step === 1 && (
            <div className={styles.formSection}>
              <h2 className={styles.stepTitle}>Documents justificatifs</h2>
              <p className={styles.stepHint}>Formats acceptés : PDF, JPG, PNG — Max 5 Mo par document.</p>
              {[
                { key: "rccmImage",     label: "Registre de commerce (RCCM)", required: false },
                { key: "taxIdImage",    label: "Carte fiscale / NIF",          required: false },
                { key: "licenseImage",  label: "Agrément importateur",         required: false },
                { key: "companyLogo",   label: "Logo de l'entreprise",         required: false },
                { key: "bankStatement", label: "Relevé bancaire (optionnel)",  required: false },
              ].map(({ key, label }) => (
                <div key={key} className={styles.docRow}>
                  <div className={styles.docInfo}>
                    <span className={styles.docLabel}>{label}</span>
                    {docPreviews[key] && (
                      <a href={docPreviews[key]} target="_blank" rel="noreferrer" className={styles.docPreview}>
                        Voir le fichier ↗
                      </a>
                    )}
                  </div>
                  <label className={styles.docUpload}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleDoc(key, e.target.files[0])} />
                    <span className={styles.docBtn}>{docs[key] ? "✅ Chargé" : "📁 Choisir"}</span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* ── ÉTAPE 2 : Activité ── */}
          {step === 2 && (
            <div className={styles.formSection}>
              <h2 className={styles.stepTitle}>Activité & spécialisation</h2>

              <fieldset className={styles.fieldset}>
                <legend>Type d'activité (plusieurs possibles)</legend>
                <div className={styles.checkGrid}>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <label key={o.value} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={activity.activityType.includes(o.value)}
                        onChange={() => toggleActivity(o.value)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend>Catégories de véhicules</legend>
                <div className={styles.checkGrid}>
                  {VEHICLE_CATEGORIES.map((c) => (
                    <label key={c} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={activity.vehicleCategories.includes(c)}
                        onChange={() => toggleCategory(c)}
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend>Pays d'opération</legend>
                <div className={styles.countryRow}>
                  <input
                    list="dl-apply-countries"
                    value={countryText}
                    onChange={(e) => setCountryText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCountry())}
                    placeholder="Ex. Chine, France, EAU…"
                  />
                  <button type="button" className={styles.btnAdd} onClick={addCountry}>+ Ajouter</button>
                </div>
                <div className={styles.tagList}>
                  {activity.operatingCountries.map((c) => (
                    <span key={c} className={styles.tag}>
                      {c}
                      <button onClick={() => setA("operatingCountries", activity.operatingCountries.filter((x) => x !== c))}>×</button>
                    </span>
                  ))}
                </div>
              </fieldset>

              <div className={styles.grid2}>
                <label>
                  <span>Volume annuel estimé</span>
                  <input value={activity.annualVolume} onChange={(e) => setA("annualVolume", e.target.value)} placeholder="50–100 véhicules/an" />
                </label>
                <label>
                  <span>Années d'expérience</span>
                  <input type="number" min="0" value={activity.yearsExperience} onChange={(e) => setA("yearsExperience", e.target.value)} placeholder="5" />
                </label>
              </div>
              <label>
                <span>Références / partenaires notables</span>
                <input list="dl-apply-references" value={activity.references} onChange={(e) => setA("references", e.target.value)} placeholder="Toyota CI, BYD Africa, DHL Logistics…" />
              </label>
              <label>
                <span>Présentation de votre activité</span>
                <textarea rows={4} value={activity.description} onChange={(e) => setA("description", e.target.value)} placeholder="Décrivez votre activité, vos points forts, vos marchés..." />
              </label>
            </div>
          )}

          {/* ── ÉTAPE 3 : Récapitulatif ── */}
          {step === 3 && (
            <div className={styles.formSection}>
              <h2 className={styles.stepTitle}>Récapitulatif de votre candidature</h2>
              <div className={styles.recapGrid}>
                <div className={styles.recapBlock}>
                  <h4>🏢 Entreprise</h4>
                  <p><strong>Nom :</strong> {company.companyName || "—"}</p>
                  <p><strong>RCCM :</strong> {company.rccm || "—"}</p>
                  <p><strong>NIF :</strong> {company.taxId || "—"}</p>
                  <p><strong>Ville :</strong> {company.city}, {company.country}</p>
                </div>
                <div className={styles.recapBlock}>
                  <h4>📁 Documents</h4>
                  {Object.entries({ rccmImage: "RCCM", taxIdImage: "NIF", licenseImage: "Agrément", companyLogo: "Logo", bankStatement: "Relevé bancaire" }).map(([k, l]) => (
                    <p key={k}><strong>{l} :</strong> {docs[k] ? "✅ Chargé" : "⬜ Non fourni"}</p>
                  ))}
                </div>
                <div className={styles.recapBlock}>
                  <h4>⚙️ Activité</h4>
                  <p><strong>Types :</strong> {activity.activityType.join(", ") || "—"}</p>
                  <p><strong>Pays :</strong> {activity.operatingCountries.join(", ") || "—"}</p>
                  <p><strong>Catégories :</strong> {activity.vehicleCategories.join(", ") || "—"}</p>
                  <p><strong>Expérience :</strong> {activity.yearsExperience || "0"} ans</p>
                </div>
              </div>

              {!company.companyName && (
                <p className={styles.warnMsg}>⚠️ Veuillez renseigner au minimum le nom de l'entreprise (étape 1).</p>
              )}

              {error && <p className={styles.errMsg}>❌ {error}</p>}

              <div className={styles.cguCheck}>
                <label>
                  <input type="checkbox" required />
                  J'accepte les <Link to="/conditions-partenaires" target="_blank">conditions partenaires</Link> et certifie l'exactitude des informations fournies.
                </label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className={styles.navBtns}>
            {step > 0 && (
              <button className={styles.btnGhost} onClick={() => setStep(step - 1)}>← Précédent</button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                className={styles.btnPrimary}
                onClick={() => setStep(step + 1)}
                disabled={step === 0 && !company.companyName}
              >
                Suivant →
              </button>
            ) : (
              <button
                className={styles.btnPrimary}
                onClick={submit}
                disabled={submitting || !company.companyName}
              >
                {submitting ? "Envoi en cours..." : "Soumettre ma candidature →"}
              </button>
            )}
          </div>
        </div>

        {/* Avantages */}
        <div className={styles.benefitsRow}>
          {[
            { icon: "🏅", title: "Badge Importateur Vérifié", desc: "Affiché sur votre profil et vos annonces." },
            { icon: "📢", title: "Publications prioritaires", desc: "Vos annonces import/export en avant-première." },
            { icon: "📊", title: "Tableau de bord dédié", desc: "Gérez vos listings, stats et demandes." },
            { icon: "🤝", title: "Réseau VIT AUTO", desc: "Accès aux acheteurs qualifiés Afrique-Asie-Europe." },
          ].map((b) => (
            <div key={b.title} className={styles.benefitCard}>
              <span className={styles.benefitIcon}>{b.icon}</span>
              <strong>{b.title}</strong>
              <p>{b.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
