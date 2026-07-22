import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import { SUBSCRIPTIONS_ENABLED } from "../config/featureFlags";
import styles from "./Plans.module.css";

// Repli affiché tant que GET /api/pricing/config n'a pas répondu — mêmes
// valeurs que server/config/defaultPricingConfig.js (source de vérité réelle).
const FALLBACK_PRICING = {
  commissions: {
    standard: { vente: 0.03, location: 0.15, chauffeur: 0.10, import_export: 0.03, leasing: 0.05 },
    premium:  { vente: 0.02, location: 0.12, chauffeur: 0.08, import_export: 0.02, leasing: 0.04 },
  },
  foundingPartner: {
    durationMonths: 12,
    entreprise:  { location: 0.10, vente: 0.015 },
    particulier: { location: 0.10, vente: 0.02 },
  },
  serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
  subscriptions: {
    individuel_plus: { priceUSD: 9.99 },
    business:         { priceUSD: 19.99 },
    exportateur:      { priceUSD: 49.99 },
  },
};

const HOW_IT_WORKS = [
  { icon: "📋", title: "Publiez votre annonce",    text: "Formulaire en 7 étapes : identité, véhicule, photos, tarif. Adresse GPS obligatoire pour la livraison." },
  { icon: "✅", title: "Validation sous 24 h",     text: "Notre équipe vérifie chaque annonce — photos, documents, adresse — avant publication." },
  { icon: "🔒", title: "Réservations sécurisées",  text: "Contrat digital, caution, paiement chiffré et suivi GPS en temps réel." },
  { icon: "💰", title: "Revenus directs",           text: "Après commission et frais de service, le montant net vous est versé via votre méthode préférée." },
];

const pct = (rate) => rate == null ? "—" : `${Math.round(rate * 1000) / 10} %`;

export default function Plans() {
  const { isAuthenticated, token } = useAuth();
  const { fmtUSD, currentCurrency } = useCurrency();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [activating,  setActivating]  = useState(null);
  const [successMsg,  setSuccessMsg]  = useState("");
  const [pricing,     setPricing]     = useState(FALLBACK_PRICING);

  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPricing(d); })
      .catch(() => {}); // repli déjà en place
  }, []);

  // Construit la liste des offres à partir de la tarification live — chaque
  // catégorie du cahier des charges (Particulier/Professionnel/Exportateur/
  // Entreprise) correspond à un palier Subscription.plan (voir server/models/Subscription.js).
  const PLANS = [
    {
      id: "free", planTier: null, name: "Gratuit", price: 0, period: null,
      badge: null, color: "#64748b", icon: "🚀",
      desc: "Toute catégorie de partenaire peut démarrer gratuitement, sans engagement.",
      features: [
        { ok: true,  text: "Publication d'annonces illimitée" },
        { ok: true,  text: "Profil partenaire complet" },
        { ok: true,  text: "Réception des demandes clients" },
        { ok: true,  text: "Contrat digital automatique" },
        { ok: false, text: "Commission réduite" },
        { ok: false, text: "Classement prioritaire" },
        { ok: false, text: "Statistiques avancées" },
        { ok: false, text: "Badge premium" },
      ],
      cta: "Plan actuel", ctaDisabled: true, popular: false,
    },
    {
      id: "individuel_plus", planTier: "individuel_plus", name: "Individuel Plus",
      price: pricing.subscriptions?.individuel_plus?.priceUSD, period: "mois",
      badge: null, color: "#6366f1", icon: "⚡",
      desc: "Pour les particuliers — vendeurs, conducteurs, loueurs privés — qui veulent plus de visibilité.",
      features: [
        { ok: true,  text: "Tout du plan Gratuit" },
        { ok: true,  text: "Commission réduite" },
        { ok: true,  text: "Classement prioritaire" },
        { ok: true,  text: "Analyses de performance" },
        { ok: true,  text: "Badge premium" },
        { ok: false, text: "Outils d'export / API" },
        { ok: false, text: "Multi-utilisateurs" },
        { ok: false, text: "Assistance premium" },
      ],
      cta: "Choisir Individuel Plus", ctaDisabled: false, popular: false,
    },
    {
      id: "business", planTier: "business", name: "Business",
      price: pricing.subscriptions?.business?.priceUSD, period: "mois",
      badge: "⭐ Recommandé", color: "#f59e0b", icon: "🏆",
      desc: "Pour les professionnels — concessionnaires, garages, sociétés de location, gestionnaires de flotte.",
      features: [
        { ok: true,  text: "Tout du plan Individuel Plus" },
        { ok: true,  text: "Classement prioritaire renforcé" },
        { ok: true,  text: "Statistiques avancées & export" },
        { ok: true,  text: "Plus de visibilité média" },
        { ok: true,  text: "Assistance premium" },
        { ok: true,  text: "Badge premium" },
        { ok: false, text: "Outils d'export / API" },
        { ok: false, text: "Multi-utilisateurs" },
      ],
      cta: "Choisir Business", ctaDisabled: false, popular: true,
    },
    {
      id: "exportateur", planTier: "exportateur", name: "Exportateur",
      price: pricing.subscriptions?.exportateur?.priceUSD, period: "mois",
      badge: "🌍 International", color: "#0ea5e9", icon: "🌍",
      desc: "Pour les exportateurs internationaux — catalogue illimité, outils d'export, accès API, CRM.",
      features: [
        { ok: true,  text: "Catalogue illimité" },
        { ok: true,  text: "Outils d'exportation" },
        { ok: true,  text: "Accès API" },
        { ok: true,  text: "CRM intégré" },
        { ok: true,  text: "Badge vérifié" },
        { ok: true,  text: "Multi-utilisateurs" },
        { ok: true,  text: "Assistance premium" },
        { ok: true,  text: "Commission réduite" },
      ],
      cta: "Choisir Exportateur", ctaDisabled: false, popular: false,
    },
    {
      id: "entreprise", planTier: null, name: "Entreprise", price: null, period: null,
      badge: "🏢 Sur devis", color: "#0f1b3f", icon: "🏛️",
      desc: "Pour les grands réseaux, flottes multi-pays et volumes importants — tarification personnalisée.",
      features: [
        { ok: true,  text: "Fonctionnalités illimitées" },
        { ok: true,  text: "Tableau de bord multi-utilisateurs" },
        { ok: true,  text: "Account manager dédié" },
        { ok: true,  text: "Devis manuel adapté à votre volume" },
      ],
      cta: "Contacter l'équipe", ctaDisabled: false, popular: false,
    },
  ];

  const handleActivate = async (plan) => {
    if (!isAuthenticated) { navigate("/login?returnTo=/plans"); return; }
    if (plan.id === "entreprise" || plan.id === "free") { navigate("/help"); return; }
    setActivating(plan.id);
    try {
      const res = await fetch("/api/subscriptions/activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planTier: plan.planTier }),
      });
      setSuccessMsg(res.ok ? t("plans.success") : t("plans.error"));
    } catch {
      setSuccessMsg(t("plans.error"));
    } finally {
      setActivating(null);
    }
  };

  const std  = pricing.commissions?.standard  || FALLBACK_PRICING.commissions.standard;
  const prem = pricing.commissions?.premium   || FALLBACK_PRICING.commissions.premium;
  const fp   = pricing.foundingPartner        || FALLBACK_PRICING.foundingPartner;
  const sf   = pricing.serviceFee             || FALLBACK_PRICING.serviceFee;

  const COMMISSIONS = [
    { label: "Location",      color: "#6366f1", standard: std.location,      premium: prem.location,      founder: fp.entreprise?.location },
    { label: "Vente",         color: "#10b981", standard: std.vente,         premium: prem.vente,         founder: fp.entreprise?.vente },
    { label: "Chauffeur",     color: "#f59e0b", standard: std.chauffeur,     premium: prem.chauffeur,     founder: null },
    { label: "Import/Export", color: "#0ea5e9", standard: std.import_export, premium: prem.import_export, founder: fp.entreprise?.import_export },
    { label: "Leasing",       color: "#8b5cf6", standard: std.leasing,       premium: prem.leasing,       founder: null },
  ];

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroBubble1} />
        <div className={styles.heroBubble2} />
        <div className={styles.heroInner}>
          <span className={styles.heroTag}>{t("plans.hero.tag")}</span>
          <h1 className={styles.heroTitle}>{t("plans.hero.title")}</h1>
          <p className={styles.heroSub}>{t("plans.hero.sub")}</p>
          <div className={styles.heroPills}>
            <span>{t("plans.hero.pill1")}</span>
            <span>{t("plans.hero.pill2")}</span>
            <span>{t("plans.hero.pill3")}</span>
          </div>
        </div>
      </section>

      {/* ════ OFFRE FONDATEUR BANNER ════ */}
      <section style={{ padding: "0 24px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          background: "linear-gradient(135deg, #fffbf0 0%, #fff7ed 100%)",
          border: "2px solid #fbbf24", borderRadius: 20, padding: "28px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 20,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: "1.6rem" }}>👑</span>
              <span style={{
                background: "#fbbf24", color: "#7c2d12", fontWeight: 900,
                fontSize: "0.7rem", padding: "3px 12px", borderRadius: 99,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>{t("plans.limited")}</span>
            </div>
            <h3 style={{ margin: "0 0 4px", fontWeight: 900, color: "#0f1b3f", fontSize: "1.1rem" }}>
              {t("plans.founder.title")}
            </h3>
            <p style={{ margin: 0, color: "#78350f", fontSize: "0.88rem" }}>
              {t("plans.founder.sub")} Taux préférentiel pendant {fp.durationMonths} mois, retour automatique au tarif standard ensuite.
            </p>
          </div>
          <Link to="/partenaires#offre-fondateur" style={{
            background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: "0.9rem",
            padding: "12px 24px", borderRadius: 11, textDecoration: "none",
            boxShadow: "0 4px 16px rgba(245,158,11,.35)", whiteSpace: "nowrap",
          }}>
            {t("plans.founder.cta")}
          </Link>
        </div>
      </section>

      {/* ════ PLANS GRID ════ */}
      <section className={styles.plansSection}>
        <div className={styles.sectionHeader}>
          <h2>{t("plans.choose.title")}</h2>
          <p>Gratuit pour démarrer — les abonnements restent facultatifs, avec commission réduite et plus de visibilité en option.</p>
        </div>

        {successMsg && (
          <div className={styles.successBanner}>{successMsg}</div>
        )}

        <div className={styles.plansGrid}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`${styles.planCard} ${plan.popular ? styles.planPopular : ""}`}
            >
              {plan.badge && (
                <div
                  className={styles.planBadge}
                  style={{ background: plan.popular ? "#f59e0b" : plan.color }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div className={styles.planHeader} style={{ borderColor: plan.color + "33" }}>
                <span className={styles.planIcon}>{plan.icon}</span>
                <h3 className={styles.planName}>{plan.name}</h3>
                <p className={styles.planDesc}>{plan.desc}</p>

                <div className={styles.planPriceWrap}>
                  {plan.price === null ? (
                    <span className={styles.planFree} style={{ color: "#0f1b3f" }}>{t("plans.quote")}</span>
                  ) : plan.price === 0 ? (
                    <span className={styles.planFree}>{t("plans.free")}</span>
                  ) : (
                    <div className={styles.planPrice}>
                      <span className={styles.planAmount}>{fmtUSD(plan.price)}</span>
                      <span className={styles.planPeriod}>/{t("plans.perMonth")}</span>
                    </div>
                  )}
                </div>
                {plan.price > 0 && (
                  <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>
                    {t("plans.currency")} {currentCurrency?.symbol || "$"}
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className={styles.features}>
                {plan.features.map((f, i) => (
                  <li key={i} className={f.ok ? styles.featureOk : styles.featureNo}>
                    <span className={styles.featureIcon} style={{ color: f.ok ? plan.color : "#cbd5e1" }}>
                      {f.ok ? "✓" : "✗"}
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {(() => {
                const forceDisabled = !SUBSCRIPTIONS_ENABLED && !["entreprise", "free"].includes(plan.id);
                const isDisabled = plan.ctaDisabled || forceDisabled;
                return (
                  <button
                    className={`${styles.planCta} ${isDisabled ? styles.planCtaDisabled : ""} ${plan.popular ? styles.planCtaPopular : ""}`}
                    style={plan.popular ? {} : { borderColor: plan.color, color: isDisabled ? "#94a3b8" : plan.color }}
                    disabled={isDisabled || activating === plan.id}
                    onClick={() => !isDisabled && handleActivate(plan)}
                    title={forceDisabled ? "Bientôt disponible" : undefined}
                  >
                    {activating === plan.id ? t("plans.activating")
                      : plan.id === "entreprise" ? t("plans.contact")
                      : forceDisabled ? "Bientôt disponible"
                      : plan.cta}
                  </button>
                );
              })()}
            </div>
          ))}
        </div>
      </section>

      {/* ════ COMMISSION TABLE ════ */}
      <section className={styles.commSection}>
        <div className={styles.commInner}>
          <div className={styles.sectionHeader}>
            <h2>{t("plans.comm.title")}</h2>
            <p>{t("plans.comm.sub")}</p>
          </div>

          <div className={styles.commTable}>
            {/* Header */}
            <div className={styles.commRow + " " + styles.commHead}>
              <div className={styles.commCell}>{t("plans.comm.service")}</div>
              <div className={`${styles.commCell} ${styles.commCellActive}`}>{t("plans.comm.founder")}</div>
              <div className={styles.commCell}>Abonné</div>
              <div className={styles.commCell}>{t("plans.comm.standard")}</div>
            </div>
            {/* Rows */}
            {COMMISSIONS.map((row) => (
              <div key={row.label} className={styles.commRow}>
                <div className={styles.commCell}>
                  <span style={{ color: row.color, fontWeight: 700 }}>{row.label}</span>
                </div>
                <div className={`${styles.commCell} ${styles.commCellActive}`}>
                  <span className={styles.commRate} style={{ color: "#f59e0b" }}>
                    {row.founder != null ? `${pct(row.founder)} (${fp.durationMonths} mois)` : "—"}
                  </span>
                </div>
                <div className={styles.commCell}>
                  <span className={styles.commRate}>{pct(row.premium)}</span>
                </div>
                <div className={styles.commCell}>
                  <span className={styles.commRate}>{pct(row.standard)}</span>
                </div>
              </div>
            ))}
            {/* Frais service */}
            <div className={styles.commRow}>
              <div className={styles.commCell}>
                <span style={{ color: "#6366f1", fontWeight: 700 }}>Frais de service client</span>
              </div>
              <div className={`${styles.commCell} ${styles.commCellActive}`} style={{ gridColumn: "span 3", fontSize: "0.82rem", color: "#64748b" }}>
                max({fmtUSD(sf.minUSD)}, {sf.percent * 100}% du montant), plafonné à {fmtUSD(sf.maxUSD)} — à la charge du client
              </div>
            </div>
          </div>

          {/* Exemples calcul */}
          <div className={styles.commExamples}>
            <div className={styles.commExample}>
              <span style={{ color: "#6366f1" }}>📊</span>
              <span>Ex. location : {fmtUSD(50)} loué → vous recevez {fmtUSD(50 * (1 - std.location) - 1)} nets (standard {pct(std.location)})</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#10b981" }}>📊</span>
              <span>Ex. vente : {fmtUSD(10000)} → vous recevez {fmtUSD(10000 * (1 - std.vente) - 25)} nets (standard {pct(std.vente)})</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#f59e0b" }}>👑</span>
              <span>Fondateur — location {fmtUSD(50)} → {fmtUSD(50 * (1 - (fp.entreprise?.location ?? std.location)) - 1)} nets ({pct(fp.entreprise?.location)} réduit)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ════ COMMENT ÇA MARCHE ════ */}
      <section className={styles.howSection}>
        <div className={styles.sectionHeader}>
          <h2>{t("plans.how.title")}</h2>
        </div>
        <div className={styles.howGrid}>
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className={styles.howCard}>
              <div className={styles.howNum}>{String(i + 1).padStart(2, "0")}</div>
              <span className={styles.howIcon}>{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════ CTA FINAL ════ */}
      <section className={styles.finalCta}>
        <div className={styles.finalInner}>
          <div className={styles.finalDecoBubble} />
          <span className={styles.finalTag}>{t("plans.cta.tag")}</span>
          <h2>{t("plans.cta.title")}</h2>
          <p>{t("plans.cta.sub")}</p>
          <div className={styles.finalBtns}>
            <button className={styles.btnPrimary} onClick={() => navigate("/vendor")}>
              {t("plans.cta.publish")}
            </button>
            <Link to="/faq" className={styles.btnSecondary}>
              {t("plans.cta.faq")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
