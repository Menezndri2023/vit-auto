import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Plans.module.css";

/* ── Constantes ──────────────────────────────────── */
const PLANS = [
  {
    id:    "decouverte",
    name:  "Gratuit",
    price: 0,
    period: null,
    badge: null,
    color: "#64748b",
    icon:  "🚀",
    desc:  "Idéal pour démarrer et tester la plateforme sans engagement.",
    features: [
      { ok: true,  text: "Jusqu'à 5 véhicules publiés" },
      { ok: true,  text: "Profil partenaire complet" },
      { ok: true,  text: "Réception des demandes clients" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: false, text: "Statistiques & performances" },
      { ok: false, text: "Mise en avant locale" },
      { ok: false, text: "Badge Partenaire Vérifié" },
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
    desc:  "Pour les partenaires actifs qui veulent plus de visibilité et de clients.",
    features: [
      { ok: true,  text: "Jusqu'à 30 véhicules publiés" },
      { ok: true,  text: "Profil partenaire complet" },
      { ok: true,  text: "Réception des demandes clients" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "Statistiques & performances" },
      { ok: true,  text: "Mise en avant locale ✓" },
      { ok: false, text: "Badge Partenaire Vérifié" },
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
    desc:  "Le choix des meilleurs partenaires. Visibilité nationale, badge vérifié.",
    features: [
      { ok: true,  text: "Véhicules illimités" },
      { ok: true,  text: "Profil partenaire complet" },
      { ok: true,  text: "Réception des demandes clients" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "Statistiques avancées & export" },
      { ok: true,  text: "Mise en avant nationale ⭐" },
      { ok: true,  text: "Badge Partenaire Vérifié ✓" },
      { ok: true,  text: "Support prioritaire 24h" },
    ],
    cta: "Choisir Premium",
    ctaDisabled: false,
    popular: true,
  },
  {
    id:    "corporate",
    name:  "Corporate",
    price: null,
    period: null,
    badge: "🏢 Sur devis",
    color: "#0f1b3f",
    icon:  "🌍",
    desc:  "Pour les grands concessionnaires, réseaux de location et flottes d'entreprises.",
    features: [
      { ok: true,  text: "Véhicules illimités (multi-agences)" },
      { ok: true,  text: "Contrat digital automatique" },
      { ok: true,  text: "Statistiques avancées & export" },
      { ok: true,  text: "Mise en avant nationale illimitée" },
      { ok: true,  text: "Badge Corporate 🏢 & page dédiée" },
      { ok: true,  text: "Tableau de bord multi-utilisateurs" },
      { ok: true,  text: "Account manager dédié" },
      { ok: true,  text: "Tarif : 1 500 – 5 000 DH/mois selon volume" },
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
    rates: { decouverte: "15 %", pro: "15 %", premium: "15 %", corporate: "15 %" },
    fondateur: "10 %",
    color: "#6366f1",
  },
  {
    label: "Vente",
    rates: { decouverte: "3 %", pro: "3 %", premium: "3 %", corporate: "3 %" },
    fondateur: "2 %",
    color: "#10b981",
  },
  {
    label: "Chauffeur",
    rates: { decouverte: "10 %", pro: "10 %", premium: "10 %", corporate: "10 %" },
    fondateur: "10 %",
    color: "#f59e0b",
  },
  {
    label: "Assurance",
    rates: { decouverte: "Négociée", pro: "Négociée", premium: "Négociée", corporate: "Négociée" },
    fondateur: "Négociée",
    color: "#0ea5e9",
  },
  {
    label: "Crédit / Leasing",
    rates: { decouverte: "Négociée", pro: "Négociée", premium: "Négociée", corporate: "Négociée" },
    fondateur: "Négociée",
    color: "#8b5cf6",
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
              }}>OFFRE LIMITÉE — 20 partenaires</span>
            </div>
            <h3 style={{ margin: "0 0 4px", fontWeight: 900, color: "#0f1b3f", fontSize: "1.1rem" }}>
              Offre Partenaire Fondateur — Gratuit 12 mois
            </h3>
            <p style={{ margin: 0, color: "#78350f", fontSize: "0.88rem" }}>
              Commission réduite · Badge Fondateur · Mise en avant permanente · Accès anticipé
            </p>
          </div>
          <Link to="/partenaires#offre-fondateur" style={{
            background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: "0.9rem",
            padding: "12px 24px", borderRadius: 11, textDecoration: "none",
            boxShadow: "0 4px 16px rgba(245,158,11,.35)", whiteSpace: "nowrap",
          }}>
            Réclamer l'offre →
          </Link>
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
                  {plan.price === null ? (
                    <span className={styles.planFree} style={{ color: "#0f1b3f" }}>Sur devis</span>
                  ) : plan.price === 0 ? (
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
            <h2>Grille des commissions VIT AUTO</h2>
            <p>Les commissions sont identiques pour tous les plans — seule l'Offre Fondateur bénéficie de taux réduits pendant 12 mois.</p>
          </div>

          <div className={styles.commTable}>
            {/* Header */}
            <div className={styles.commRow + " " + styles.commHead}>
              <div className={styles.commCell}>Service</div>
              <div className={`${styles.commCell} ${styles.commCellActive}`}>👑 Fondateur</div>
              <div className={styles.commCell}>Standard (tous plans)</div>
              <div className={styles.commCell}>Exemple (standard)</div>
            </div>
            {/* Rows */}
            {COMMISSIONS.map((row) => (
              <div key={row.label} className={styles.commRow}>
                <div className={styles.commCell}>
                  <span style={{ color: row.color, fontWeight: 700 }}>{row.label}</span>
                </div>
                <div className={`${styles.commCell} ${styles.commCellActive}`}>
                  <span className={styles.commRate} style={{ color: "#f59e0b" }}>{row.fondateur}</span>
                </div>
                <div className={styles.commCell}>
                  <span className={styles.commRate}>{row.rates.decouverte}</span>
                </div>
                <div className={styles.commCell} style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  {row.label === "Location" && "500 DH → 75 DH comm."}
                  {row.label === "Vente" && "100 000 DH → 3 000 DH comm."}
                  {row.label === "Chauffeur" && "300 DH → 30 DH comm."}
                  {(row.label === "Assurance" || row.label === "Crédit / Leasing") && "Selon accord partenaire"}
                </div>
              </div>
            ))}
            {/* Frais service */}
            <div className={styles.commRow}>
              <div className={styles.commCell}>
                <span style={{ color: "#6366f1", fontWeight: 700 }}>Frais service client</span>
              </div>
              <div className={`${styles.commCell} ${styles.commCellActive}`}>
                <span className={styles.commRate} style={{ color: "#f59e0b" }}>15 DH</span>
              </div>
              <div className={styles.commCell}>
                <span className={styles.commRate}>15 DH fixe</span>
              </div>
              <div className={styles.commCell} style={{ fontSize: "0.8rem", color: "#64748b" }}>
                À la charge du client
              </div>
            </div>
          </div>

          {/* Exemples calcul */}
          <div className={styles.commExamples}>
            <div className={styles.commExample}>
              <span style={{ color: "#6366f1" }}>📊</span>
              <span>Ex. location : {fmtFromMAD(500)} loué → vous recevez {fmtFromMAD(500 * 0.85 - 15)} nets (standard 15%)</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#10b981" }}>📊</span>
              <span>Ex. vente : {fmtFromMAD(100000)} → vous recevez {fmtFromMAD(100000 * 0.97 - 15)} nets (standard 3%)</span>
            </div>
            <div className={styles.commExample}>
              <span style={{ color: "#f59e0b" }}>👑</span>
              <span>Fondateur — location {fmtFromMAD(500)} → {fmtFromMAD(500 * 0.90 - 15)} nets (10% réduit)</span>
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
