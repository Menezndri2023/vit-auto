import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import { PAYMENTS_ENABLED_FALLBACK } from "../config/featureFlags";
import { PLAN_INCLUDED_BOOSTS } from "../constants/subscriptionPlans";
import { PLAN_SEATS, PLAN_SUPPORT_SLA_HOURS, AVANCE_DEMANDES_HEURES, PLACES_VITRINE_PAR_PLAN, LIBELLE_PLAN, PLAN_SECTEURS, PLAN_QUOTA_ANNONCES, FIN_IMMUNITE_QUOTAS, OUTILS_PAR_SECTEUR } from "../constants/planFeatures";
import { ACTIVITIES, SECTEUR_LABELS, secteursDuPartenaire } from "../constants/partnerTaxonomy";
import { libelleTraduit } from "../i18n/libelles";
import styles from "./Plans.module.css";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

// Repli affiché tant que GET /api/pricing/config n'a pas répondu — mêmes
// valeurs que server/config/defaultPricingConfig.js (source de vérité réelle).
const FALLBACK_PRICING = {
  commissions: {
    // Ce repli s'affiche une fraction de seconde sur une page de TARIFS : des
    // valeurs périmées y annoncent brièvement des taux que le client ne paiera
    // pas. Il doit rester le miroir exact de server/config/defaultPricingConfig.js.
    standard: { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.05, activite: 0.15 },
    premium:  { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.05, activite: 0.15 },
  },
  foundingPartner: {
    durationMonths: 12,
    entreprise:  { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10, activite: 0.10 },
    particulier: { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10, activite: 0.10 },
  },
  serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
  subscriptions: {
    individuel_plus: { priceUSD: 9.99 },
    business:         { priceUSD: 19.99 },
    exportateur:      { priceUSD: 49.99 },
  },
};

const HOW_IT_WORKS = [
  { icon: "📋", key: "plans.how1" },
  { icon: "✅", key: "plans.how2" },
  { icon: "🔒", key: "plans.how3" },
  { icon: "💰", key: "plans.how4" },
];

const pct = (rate) => rate == null ? "—" : `${Math.round(rate * 1000) / 10} %`;

export default function Plans() {
  // `t` d'abord : useDocumentMeta le lit, et lire une const déclarée plus bas
  // plante toute la page (règle vit/lecture-avant-declaration).
  const { t, lang } = useI18n();

  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  useDocumentMeta({
    title: t("plans.hero.title"),
    description: t("plans.metaDesc"),
    traduite: true,
  });

  const { isAuthenticated, token, user } = useAuth();
  // Secteur dont on montre les outils : celui du partenaire connecté, sinon
  // Location — le visiteur change d'onglet. Même prix et même palier pour
  // tous les métiers ; seul le contenu affiché varie.
  const [secteur, setSecteur] = useState(() => secteursDuPartenaire(user)[0] || "loueur");
  const [secteurChoisi, setSecteurChoisi] = useState(false);
  // La session se résout après le premier rendu : on suit le secteur du
  // compte dès qu'il arrive, sauf si le visiteur a déjà cliqué un onglet.
  const secteurDuCompte = secteursDuPartenaire(user)[0] || null;
  useEffect(() => {
    if (secteurDuCompte && !secteurChoisi) setSecteur(secteurDuCompte);
  }, [secteurDuCompte, secteurChoisi]);
  const { fmtUSD, currentCurrency } = useCurrency();
  const navigate = useNavigate();
  const [activating,  setActivating]  = useState(null);
  const [successMsg,  setSuccessMsg]  = useState("");
  const [pricing,     setPricing]     = useState(FALLBACK_PRICING);
  const [promoCode,   setPromoCode]   = useState("");

  // Ouverture des paiements : décidée par le SERVEUR (PAYMENTS_ENABLED), lue
  // dans la config publique. Repli fermé tant que la réponse n'est pas là.
  const paymentsOpen = pricing?.paymentsEnabled ?? PAYMENTS_ENABLED_FALLBACK;

  // Un plan payant demandé alors que le paiement en ligne n'est pas ouvert :
  // la demande part au support, qui l'active. « entreprise » (devis manuel) et
  // « free » ne sont pas concernés.
  const estDemandeSupport = (plan) => !paymentsOpen && !["entreprise", "free"].includes(plan.id);

  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPricing(d); })
      .catch(() => {}); // repli déjà en place
  }, []);

  const immuniteEnCours = new Date() < FIN_IMMUNITE_QUOTAS;
  // La date suit la langue affichée : « 1 janvier 2027 » dans une phrase
  // anglaise trahirait que seule la moitié de la page est traduite.
  const finImmunite = FIN_IMMUNITE_QUOTAS.toLocaleDateString(lang === "zh" ? "zh-Hans" : lang, { day: "numeric", month: "long", year: "numeric" });
  const texteSecteurs = (plan) => {
    const n = PLAN_SECTEURS[plan];
    if (n === null) return t("plans.f.allSectors");
    return t(n > 1 ? "plans.f.nSectors" : "plans.f.oneSector", { n });
  };
  // Le quota ne s'applique qu'après l'immunité de lancement ; d'ici là, on le
  // dit tel quel — annoncer une limite qui ne s'applique pas encore ferait
  // fuir sans raison.
  const texteQuota = (plan) => {
    const q = PLAN_QUOTA_ANNONCES[plan];
    if (q === null) return t("plans.f.unlimitedAds");
    return immuniteEnCours
      ? t("plans.f.quotaUntil", { date: finImmunite, n: q })
      : t("plans.f.quota", { n: q });
  };
  const outils = (plan) => (OUTILS_PAR_SECTEUR[secteur]?.[plan] || []).map((o) => ({ ok: true, text: t(o.key) }));

  // Construit la liste des offres à partir de la tarification live — chaque
  // catégorie du cahier des charges (Particulier/Professionnel/Exportateur/
  // Entreprise) correspond à un palier Subscription.plan (voir server/models/Subscription.js).
  const PLANS = [
    {
      id: "free", planTier: null, name: LIBELLE_PLAN.free, price: 0, period: null,
      badge: null, color: "#64748b", icon: "🚀",
      desc: t("plans.desc.free"),
      features: [
        { ok: true,  text: texteSecteurs("free") },
        { ok: true,  text: texteQuota("free") },
        { ok: true,  text: t("plans.f.fullProfile") },
        { ok: true,  text: t("plans.f.receiveLeads") },
        { ok: true,  text: t("plans.f.digitalContract") },
        { ok: false, text: t("plans.f.topRank") },
        { ok: false, text: t("plans.f.advStats") },
        { ok: false, text: t("plans.f.proBadge") },
      ],
      cta: t("plans.currentPlan"), ctaDisabled: true, popular: false,
    },
    {
      id: "individuel_plus", planTier: "individuel_plus", name: LIBELLE_PLAN.individuel_plus,
      price: pricing.subscriptions?.individuel_plus?.priceUSD, period: t("plans.perMonth"),
      badge: null, color: "#6366f1", icon: "⚡",
      desc: t("plans.desc.individuel"),
      features: [
        { ok: true,  text: t("plans.f.allOf", { plan: LIBELLE_PLAN.free }) },
        { ok: true,  text: texteSecteurs("individuel_plus") },
        { ok: true,  text: texteQuota("individuel_plus") },
        ...outils("individuel_plus"),
        { ok: true,  text: t("plans.f.boosts", { n: PLAN_INCLUDED_BOOSTS.individuel_plus }) },
        { ok: true,  text: t("plans.f.topRank") },
        { ok: true,  text: t("plans.f.perfStats") },
        { ok: true,  text: t("plans.f.proBadgeAll") },
        { ok: true,  text: t("plans.f.support", { n: PLAN_SUPPORT_SLA_HOURS.individuel_plus }) },
        { ok: true,  text: t(PLACES_VITRINE_PAR_PLAN.individuel_plus > 1 ? "plans.f.seats" : "plans.f.seat", { n: PLACES_VITRINE_PAR_PLAN.individuel_plus }) },
        { ok: false, text: t("plans.f.noStatsExport") },
        { ok: false, text: t("plans.f.multiUser") },
        { ok: false, text: t("plans.f.apiAccess") },
      ],
      cta: t("plans.choosePlan", { plan: LIBELLE_PLAN.individuel_plus }), ctaDisabled: false, popular: false,
    },
    {
      id: "business", planTier: "business", name: LIBELLE_PLAN.business,
      price: pricing.subscriptions?.business?.priceUSD, period: t("plans.perMonth"),
      badge: t("plans.badge.recommended"), color: "#f59e0b", icon: "🏆",
      desc: t("plans.desc.business"),
      features: [
        { ok: true,  text: t("plans.f.allOf", { plan: LIBELLE_PLAN.individuel_plus }) },
        { ok: true,  text: texteSecteurs("business") },
        { ok: true,  text: texteQuota("business") },
        ...outils("business"),
        { ok: true,  text: t("plans.f.boosts", { n: PLAN_INCLUDED_BOOSTS.business }) },
        { ok: true,  text: t("plans.f.topRankPlus") },
        { ok: true,  text: t("plans.f.statsPerAd") },
        { ok: true,  text: t("plans.f.statsExport") },
        { ok: true,  text: t("plans.f.supportPrio", { n: PLAN_SUPPORT_SLA_HOURS.business }) },
        { ok: true,  text: t("plans.f.userSeats", { n: PLAN_SEATS.business }) },
        { ok: true,  text: t("plans.f.earlyLeads", { n: AVANCE_DEMANDES_HEURES }) },
        { ok: true,  text: t("plans.f.monthlyReport") },
        { ok: true,  text: t("plans.f.proBadgeAll") },
        { ok: false, text: t("plans.f.apiAccess") },
        { ok: true,  text: t(PLACES_VITRINE_PAR_PLAN.business > 1 ? "plans.f.seats" : "plans.f.seat", { n: PLACES_VITRINE_PAR_PLAN.business }) },
      ],
      cta: t("plans.choosePlan", { plan: LIBELLE_PLAN.business }), ctaDisabled: false, popular: true,
    },
    {
      id: "exportateur", planTier: "exportateur", name: LIBELLE_PLAN.exportateur,
      price: pricing.subscriptions?.exportateur?.priceUSD, period: t("plans.perMonth"),
      badge: t("plans.badge.volume"), color: "#0ea5e9", icon: "🌍",
      desc: t("plans.desc.exportateur"),
      features: [
        { ok: true,  text: t("plans.f.allOf", { plan: LIBELLE_PLAN.business }) },
        { ok: true,  text: texteSecteurs("exportateur") },
        { ok: true,  text: texteQuota("exportateur") },
        ...outils("exportateur"),
        { ok: true,  text: t("plans.f.boosts", { n: PLAN_INCLUDED_BOOSTS.exportateur }) },
        { ok: true,  text: t("plans.f.crm") },
        { ok: true,  text: t("plans.f.apiSync") },
        { ok: true,  text: t("plans.f.userSeatsPlain", { n: PLAN_SEATS.exportateur }) },
        { ok: true,  text: t(PLACES_VITRINE_PAR_PLAN.exportateur > 1 ? "plans.f.seats" : "plans.f.seat", { n: PLACES_VITRINE_PAR_PLAN.exportateur }) },
        { ok: true,  text: t("plans.f.supportPrio", { n: PLAN_SUPPORT_SLA_HOURS.exportateur }) },
      ],
      cta: t("plans.choosePlan", { plan: LIBELLE_PLAN.exportateur }), ctaDisabled: false, popular: false,
    },
    {
      id: "entreprise", planTier: null, name: LIBELLE_PLAN.entreprise, price: null, period: null,
      badge: t("plans.badge.quote"), color: "#0f1b3f", icon: "🏛️",
      desc: t("plans.desc.entreprise"),
      features: [
        { ok: true,  text: t("plans.f.unlimited") },
        { ok: true,  text: t("plans.f.multiDash") },
        { ok: true,  text: t("plans.f.accountMgr") },
        { ok: true,  text: t("plans.f.customQuote") },
      ],
      cta: t("plans.contact"), ctaDisabled: false, popular: false,
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
        body: JSON.stringify({ planTier: plan.planTier, promoCode: promoCode.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      // Le serveur distingue « demande enregistrée, paiement à confirmer » de
      // « demande envoyée au support » : son message est plus précis que le
      // libellé générique, et dit au partenaire ce qui va réellement se passer.
      setSuccessMsg(res.ok ? (data?.message || t("plans.success")) : (data?.message || t("plans.error")));
    } catch {
      setSuccessMsg(t("plans.error"));
    } finally {
      setActivating(null);
    }
  };

  const std  = pricing.commissions?.standard  || FALLBACK_PRICING.commissions.standard;
  const fp   = pricing.foundingPartner        || FALLBACK_PRICING.foundingPartner;
  const sf   = pricing.serviceFee             || FALLBACK_PRICING.serviceFee;

  const COMMISSIONS = [
    { label: t("plans.comm.rental"),  color: "#6366f1", standard: std.location,      founder: fp.entreprise?.location },
    { label: t("plans.comm.sale"),    color: "#10b981", standard: std.vente,         founder: fp.entreprise?.vente },
    { label: t("plans.comm.driver"),  color: "#f59e0b", standard: std.chauffeur,     founder: fp.entreprise?.chauffeur },
    { label: t("plans.comm.ie"),      color: "#0ea5e9", standard: std.import_export, founder: fp.entreprise?.import_export },
    { label: t("plans.comm.leisure"), color: "#ec4899", standard: std.activite ?? FALLBACK_PRICING.commissions.standard.activite, founder: fp.entreprise?.activite ?? FALLBACK_PRICING.foundingPartner.entreprise.activite },
    { label: t("plans.comm.leasing"), color: "#8b5cf6", standard: std.leasing,       founder: null },
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
              {t("plans.founder.sub")} {t("plans.founderTail", { n: fp.durationMonths })}
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
          <p>{t("plans.choose.sub2")}</p>
        </div>

        {successMsg && (
          <div className={styles.successBanner}>{successMsg}</div>
        )}

        <div role="tablist" aria-label={t("plans.sectorTabs")} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: "1rem" }}>
          {ACTIVITIES.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={secteur === a}
              onClick={() => { setSecteur(a); setSecteurChoisi(true); }}
              style={{
                padding: "8px 14px", borderRadius: 999, fontSize: ".82rem", fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${secteur === a ? "#0f1b3f" : "#e2e8f0"}`,
                background: secteur === a ? "#0f1b3f" : "#fff", color: secteur === a ? "#fff" : "#334155",
              }}
            >
              {libelleTraduit(t, "sect", a, SECTEUR_LABELS)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder={t("plans.promoPh")}
            style={{ maxWidth: 240, width: "100%", padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".85rem", textAlign: "center" }}
          />
        </div>

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
                {/* Trois états, et non deux : un avantage ANNONCÉ mais pas
                    encore construit ne doit pas porter la même coche qu'un
                    avantage réel — c'est le client qui paierait la différence.
                    `soon` le distingue explicitement. */}
                {plan.features.map((f, i) => (
                  <li key={i} className={f.ok ? styles.featureOk : styles.featureNo}>
                    <span className={styles.featureIcon} style={{ color: f.ok ? plan.color : f.soon ? "#f59e0b" : "#cbd5e1" }}>
                      {f.ok ? "✓" : f.soon ? "🔜" : "✗"}
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
              {plan.features.some((f) => f.soon) && (
                <p style={{ fontSize: ".7rem", color: "#94a3b8", marginTop: -4, marginBottom: 10, lineHeight: 1.4 }}>
                  {t("plans.soonNote")}
                </p>
              )}

              {/* CTA */}
              {(() => {
                // `demandeSupport` n'est plus un blocage : le bouton reste
                // CLIQUABLE et enregistre une demande que l'administration
                // confirme. Seul son libellé change, pour que le partenaire
                // sache qu'il ne paie pas en ligne à cet instant.
                const demandeSupport = estDemandeSupport(plan);
                const isDisabled = plan.ctaDisabled;
                return (
                  <button
                    className={`${styles.planCta} ${isDisabled ? styles.planCtaDisabled : ""} ${plan.popular ? styles.planCtaPopular : ""}`}
                    style={plan.popular ? {} : { borderColor: plan.color, color: isDisabled ? "#94a3b8" : plan.color }}
                    disabled={isDisabled || activating === plan.id}
                    onClick={() => !isDisabled && handleActivate(plan)}
                    title={demandeSupport ? t("pay.disabledNotice") : undefined}
                  >
                    {activating === plan.id ? t("plans.activating")
                      : plan.id === "entreprise" ? t("plans.contact")
                      : demandeSupport ? t("pay.disabledCta")
                      : plan.cta}
                  </button>
                );
              })()}
              {/* La notice est écrite, pas seulement en info-bulle : sur mobile
                  un `title=` ne s'affiche jamais, et c'est là que le client
                  doit apprendre qu'il peut passer par le support. */}
              {estDemandeSupport(plan) && (
                <p style={{ fontSize: ".72rem", color: "#b45309", marginTop: 8, lineHeight: 1.4 }}>
                  {t("pay.disabledNotice")}
                </p>
              )}
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
              {/* La colonne « Abonné » a disparu : les taux d'abonnement sont
                  désormais identiques au standard — ces taux SONT déjà les taux
                  réduits, l'abonnement ne retranche plus rien par-dessus.
                  Afficher deux colonnes au contenu identique laissait croire à
                  un avantage inexistant. */}
              <div className={`${styles.commCell} ${styles.commCellActive}`}>{t("plans.comm.founder")}</div>
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
                    {row.founder != null ? `${pct(row.founder)} (${t("plans.comm.months", { n: fp.durationMonths })})` : "—"}
                  </span>
                </div>
                <div className={styles.commCell}>
                  <span className={styles.commRate}>{pct(row.standard)}</span>
                </div>
              </div>
            ))}
            {/* Frais service */}
            <div className={styles.commRow}>
              <div className={styles.commCell}>
                <span style={{ color: "#6366f1", fontWeight: 700 }}>{t("plans.comm.clientFee")}</span>
              </div>
              <div className={`${styles.commCell} ${styles.commCellActive}`} style={{ gridColumn: "span 2", fontSize: "0.82rem", color: "#64748b" }}>
                {t("plans.comm.feeFormula", { min: fmtUSD(sf.minUSD), pct: sf.percent * 100, max: fmtUSD(sf.maxUSD) })}
              </div>
            </div>
          </div>

          {/* Exemples calcul */}
          <div className={styles.commExamples}>
            <div className={styles.commExample}>
              <span style={{ color: "#6366f1" }}>📊</span>
              <span>{t("plans.ex.rental", { loue: fmtUSD(50), net: fmtUSD(50 * (1 - std.location) - 1), taux: pct(std.location) })}</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#10b981" }}>📊</span>
              <span>{t("plans.ex.sale", { prix: fmtUSD(10000), net: fmtUSD(10000 * (1 - std.vente) - 25), taux: pct(std.vente) })}</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#f59e0b" }}>👑</span>
              <span>{t("plans.ex.founder", { loue: fmtUSD(50), net: fmtUSD(50 * (1 - (fp.entreprise?.location ?? std.location)) - 1), taux: pct(fp.entreprise?.location) })}</span>
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
            <div key={step.key} className={styles.howCard}>
              <div className={styles.howNum}>{String(i + 1).padStart(2, "0")}</div>
              <span className={styles.howIcon}>{step.icon}</span>
              <h3>{t(step.key)}</h3>
              <p>{t(`${step.key}d`)}</p>
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
