import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Plans.module.css";

/* ── Constantes ──────────────────────────────────── */
const PLANS = [
  {
    id:    "decouverte",
    name:  "Découverte",
    price: 0,
    period: null,
    badge: null,
    color: "#64748b",
    icon:  "🚀",
    desc:  "Idéal pour commencer et tester la plateforme sans engagement.",
    features: [
      { ok: true,  text: "Jusqu'à 5 annonces actives" },
      { ok: true,  text: "Commission location : 15 %" },
      { ok: true,  text: "Commission vente : 3 %" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: false, text: "Mise en avant des annonces" },
      { ok: false, text: "Badge Partenaire Vérifié" },
      { ok: false, text: "Statistiques détaillées" },
      { ok: false, text: "Support prioritaire" },
    ],
    cta: "Plan actuel",
    ctaDisabled: true,
    popular: false,
  },
  {
    id:    "pro",
    name:  "Pro",
    price: 199,
    period: "mois",
    badge: null,
    color: "#6366f1",
    icon:  "⚡",
    desc:  "Pour les partenaires actifs qui veulent plus de visibilité.",
    features: [
      { ok: true,  text: "Annonces illimitées" },
      { ok: true,  text: "Commission location : 12 %" },
      { ok: true,  text: "Commission vente : 2,5 %" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "1 mise en avant / mois offerte" },
      { ok: true,  text: "Badge Partenaire Vérifié ✓" },
      { ok: true,  text: "Statistiques (vues, clics, taux)" },
      { ok: false, text: "Support prioritaire 24h" },
    ],
    cta: "Choisir Pro",
    ctaDisabled: false,
    popular: false,
  },
  {
    id:    "premium",
    name:  "Premium",
    price: 499,
    period: "mois",
    badge: "⭐ Recommandé",
    color: "#f59e0b",
    icon:  "🏆",
    desc:  "Le choix des meilleurs partenaires. Commissions réduites, support VIP.",
    features: [
      { ok: true,  text: "Annonces illimitées" },
      { ok: true,  text: "Commission location : 10 %" },
      { ok: true,  text: "Commission vente : 2 %" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "3 mises en avant / mois offertes" },
      { ok: true,  text: "Badge Premium ⭐ visible" },
      { ok: true,  text: "Statistiques avancées & export" },
      { ok: true,  text: "Support prioritaire 24h" },
    ],
    cta: "Choisir Premium",
    ctaDisabled: false,
    popular: true,
  },
  {
    id:    "corporate",
    name:  "Corporate",
    price: 899,
    period: "mois",
    badge: "🏢 Entreprise",
    color: "#0f1b3f",
    icon:  "🌍",
    desc:  "Pour les agences et entreprises avec flotte multi-véhicules.",
    features: [
      { ok: true,  text: "Annonces illimitées (multi-agences)" },
      { ok: true,  text: "Commission location : 8 %" },
      { ok: true,  text: "Commission vente : 1,5 %" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "Mises en avant illimitées" },
      { ok: true,  text: "Badge Corporate 🏢 & page dédiée" },
      { ok: true,  text: "Tableau de bord multi-utilisateurs" },
      { ok: true,  text: "Account manager dédié" },
    ],
    cta: "Contacter l'équipe",
    ctaDisabled: false,
    popular: false,
  },
];

const HOW_IT_WORKS = [
  { icon: "📋", title: "Publiez votre annonce",    text: "Formulaire en 7 étapes : identité, véhicule, photos, tarif. Adresse GPS obligatoire pour la livraison." },
  { icon: "✅", title: "Validation sous 24 h",     text: "Notre équipe vérifie chaque annonce — photos, documents, adresse — avant publication." },
  { icon: "🔒", title: "Réservations sécurisées",  text: "Contrat digital, caution, paiement chiffré et suivi GPS en temps réel." },
  { icon: "💰", title: "Revenus directs",           text: "Après commission et frais de service, le montant net vous est versé via votre méthode préférée." },
];

const COMMISSIONS = [
  {
    label: "Location",
    rates: { decouverte: "15 %", pro: "12 %", premium: "10 %", corporate: "8 %" },
    exampleKey: "location",
    color: "#6366f1",
  },
  {
    label: "Vente",
    rates: { decouverte: "3 %", pro: "2,5 %", premium: "2 %", corporate: "1,5 %" },
    exampleKey: "vente",
    color: "#10b981",
  },
];

export default function Plans() {
  const { user, isAuthenticated } = useAuth();
  const { fmtFromMAD, currentCurrency } = useCurrency();
  const navigate = useNavigate();
  const [activating, setActivating] = useState(null);
  const [successMsg, setSuccessMsg]  = useState("");

  const fmtPlan = (mad) => mad === 0 ? "Gratuit" : fmtFromMAD(mad);

  const handleActivate = async (plan) => {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (plan.id === "corporate") { navigate("/help"); return; }
    setActivating(plan.id);
    try {
      const token = localStorage.getItem("vit_token");
      const res = await fetch("/api/subscriptions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: plan.id, price: plan.price }),
      });
      setSuccessMsg(res.ok
        ? `Plan ${plan.name} activé ! Profitez de tous vos avantages.`
        : "Erreur lors de l'activation. Réessayez ou contactez le support.");
    } catch {
      setSuccessMsg("Erreur réseau. Réessayez.");
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroBubble1} />
        <div className={styles.heroBubble2} />
        <div className={styles.heroInner}>
          <span className={styles.heroTag}>💼 PARTENAIRES VIT AUTO</span>
          <h1 className={styles.heroTitle}>Tarifs & Abonnements</h1>
          <p className={styles.heroSub}>
            Publiez vos véhicules, réduisez vos commissions et développez votre activité.
            Passez au plan supérieur à tout moment.
          </p>
          <div className={styles.heroPills}>
            <span>✅ Sans engagement</span>
            <span>🌍 14 pays couverts</span>
            <span>💳 Paiement sécurisé</span>
          </div>
        </div>
      </section>

      {/* ════ PLANS GRID ════ */}
      <section className={styles.plansSection}>
        <div className={styles.sectionHeader}>
          <h2>Choisissez votre plan</h2>
          <p>Tous les plans incluent le contrat digital, la gestion des réservations et le paiement sécurisé.</p>
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
                  {plan.price === 0 ? (
                    <span className={styles.planFree}>Gratuit</span>
                  ) : (
                    <div className={styles.planPrice}>
                      <span className={styles.planAmount}>{fmtPlan(plan.price)}</span>
                      <span className={styles.planPeriod}>/{plan.period}</span>
                    </div>
                  )}
                </div>
                {plan.price > 0 && (
                  <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>
                    Devise : {currentCurrency?.symbol || "DH"}
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
              <button
                className={`${styles.planCta} ${plan.ctaDisabled ? styles.planCtaDisabled : ""} ${plan.popular ? styles.planCtaPopular : ""}`}
                style={plan.popular ? {} : { borderColor: plan.color, color: plan.ctaDisabled ? "#94a3b8" : plan.color }}
                disabled={plan.ctaDisabled || activating === plan.id}
                onClick={() => !plan.ctaDisabled && handleActivate(plan)}
              >
                {activating === plan.id ? "Activation…" : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ════ COMMISSION TABLE ════ */}
      <section className={styles.commSection}>
        <div className={styles.commInner}>
          <div className={styles.sectionHeader}>
            <h2>Comparatif des commissions par plan</h2>
            <p>Plus vous montez en plan, moins vous payez de commission — et plus vous gardez.</p>
          </div>

          <div className={styles.commTable}>
            {/* Header */}
            <div className={styles.commRow + " " + styles.commHead}>
              <div className={styles.commCell}>Service</div>
              {PLANS.map((p) => (
                <div key={p.id} className={`${styles.commCell} ${p.popular ? styles.commCellActive : ""}`}>
                  {p.icon} {p.name}
                </div>
              ))}
            </div>
            {/* Rows */}
            {COMMISSIONS.map((row) => (
              <div key={row.label} className={styles.commRow}>
                <div className={styles.commCell}>
                  <span style={{ color: row.color, fontWeight: 700 }}>{row.label}</span>
                </div>
                {PLANS.map((p) => (
                  <div key={p.id} className={`${styles.commCell} ${p.popular ? styles.commCellActive : ""}`}>
                    <span className={styles.commRate} style={{ color: p.popular ? "#f59e0b" : "#0f1b3f" }}>
                      {row.rates[p.id]}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {/* Frais service */}
            <div className={styles.commRow}>
              <div className={styles.commCell}>
                <span style={{ color: "#6366f1", fontWeight: 700 }}>Frais service</span>
              </div>
              {PLANS.map((p) => (
                <div key={p.id} className={`${styles.commCell} ${p.popular ? styles.commCellActive : ""}`}>
                  <span className={styles.commRate}>{fmtFromMAD(15)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Exemple calcul en devise locale */}
          <div className={styles.commExamples}>
            <div className={styles.commExample}>
              <span style={{ color: "#6366f1" }}>📊</span>
              <span>Ex. location : {fmtFromMAD(6050)} loué → Pack Premium : {fmtFromMAD(6050 * 0.9 - 15)} nets</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#10b981" }}>📊</span>
              <span>Ex. vente : {fmtFromMAD(302500)} → Pack Premium : {fmtFromMAD(302500 * 0.98 - 15)} nets</span>
            </div>
          </div>
        </div>
      </section>

      {/* ════ COMMENT ÇA MARCHE ════ */}
      <section className={styles.howSection}>
        <div className={styles.sectionHeader}>
          <h2>Comment ça marche ?</h2>
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
          <span className={styles.finalTag}>🤝 DEVENEZ PARTENAIRE</span>
          <h2>Prêt à publier votre première annonce ?</h2>
          <p>Rejoignez des centaines de partenaires actifs en Afrique et en Europe. Publication gratuite, paiements automatisés.</p>
          <div className={styles.finalBtns}>
            <button className={styles.btnPrimary} onClick={() => navigate("/vendor")}>
              Publier une annonce
            </button>
            <Link to="/faq" className={styles.btnSecondary}>
              Lire la FAQ
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
