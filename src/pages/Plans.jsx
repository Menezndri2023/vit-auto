import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./Plans.module.css";

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

const PLANS = [
  {
    id: "free",
    name: "Gratuit",
    price: 0,
    badge: null,
    color: "#64748b",
    features: [
      { ok: true,  text: "Publications illimitées" },
      { ok: true,  text: "Commission location : 15 %" },
      { ok: true,  text: "Commission vente : 3 %" },
      { ok: true,  text: "Frais de service : 1 000 FCFA / réservation" },
      { ok: false, text: "Mise en avant automatique" },
      { ok: false, text: "Badge Vendeur Pro" },
      { ok: false, text: "Statistiques avancées" },
      { ok: false, text: "Support prioritaire" },
    ],
    cta: "Plan actuel",
    ctaDisabled: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 25000,
    badge: "Recommandé",
    color: "#f59e0b",
    features: [
      { ok: true, text: "Publications illimitées" },
      { ok: true, text: "Commission location : 15 %" },
      { ok: true, text: "Commission vente : 3 %" },
      { ok: true, text: "Frais de service : 1 000 FCFA / réservation" },
      { ok: true, text: "Mise en avant automatique" },
      { ok: true, text: "Badge Vendeur Pro visible" },
      { ok: true, text: "Statistiques avancées (vues, clics, taux)" },
      { ok: true, text: "Support prioritaire 24h" },
    ],
    cta: "Passer en Pro",
    ctaDisabled: false,
  },
];

const BOOSTS = [
  {
    id: "boost_30",
    name: "Mise en avant — 30 jours",
    price: 5000,
    description: "Votre annonce s'affiche en tête de catalogue pendant 30 jours.",
    icon: "🚀",
  },
];

const HOW_IT_WORKS = [
  {
    icon: "📋",
    title: "Publiez votre annonce",
    text: "Remplissez le formulaire en 7 étapes : identité, véhicule, photos, tarif.",
  },
  {
    icon: "✅",
    title: "Validation sous 24 h",
    text: "Notre équipe vérifie chaque annonce avant publication.",
  },
  {
    icon: "🔒",
    title: "Réservations sécurisées",
    text: "Chaque réservation inclut un contrat digital, une caution de 200 000 FCFA et un suivi en temps réel.",
  },
  {
    icon: "💰",
    title: "Revenus nets",
    text: "Après commission (15 % location / 3 % vente) et frais de service (1 000 FCFA), le reste vous est versé.",
  },
];

export default function Plans() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [activating, setActivating] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleActivatePro = async () => {
    if (!isAuthenticated) { navigate("/login"); return; }
    setActivating(true);
    try {
      const token = localStorage.getItem("vit_token");
      const res = await fetch("/api/subscriptions/activate-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentMethod: "card" }),
      });
      if (res.ok) {
        setSuccessMsg("Plan Pro activé ! Profitez de tous les avantages pendant 30 jours.");
      } else {
        setSuccessMsg("Erreur lors de l'activation. Réessayez.");
      }
    } catch {
      setSuccessMsg("Erreur réseau. Réessayez.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <h1>Tarifs & Abonnements</h1>
        <p>Publiez vos véhicules sur VIT AUTO et développez votre activité en toute transparence.</p>
      </section>

      {/* ── Comment ça marche ── */}
      <section className={styles.howSection}>
        <h2>Comment ça marche ?</h2>
        <div className={styles.howGrid}>
          {HOW_IT_WORKS.map((step) => (
            <div key={step.title} className={styles.howCard}>
              <span className={styles.howIcon}>{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Commissions ── */}
      <section className={styles.commissionsSection}>
        <h2>Structure des commissions</h2>
        <p className={styles.commissionSubtitle}>
          VIT AUTO prend en charge la plateforme, la sécurité et le marketing.
          Vous recevez le reste directement.
        </p>
        <div className={styles.commissionGrid}>
          <div className={styles.commissionCard}>
            <div className={styles.commissionRate}>15 %</div>
            <h3>Location de véhicule</h3>
            <p>Commission prélevée sur le montant de base de chaque location.</p>
            <div className={styles.commissionExample}>
              <span>Ex. : 100 000 FCFA de location</span>
              <span>→ Votre net : <strong>84 000 FCFA</strong></span>
              <small>(100 000 − 15 000 commission − 1 000 frais service)</small>
            </div>
          </div>
          <div className={styles.commissionCard}>
            <div className={styles.commissionRate} style={{ background: "#10b981" }}>3 %</div>
            <h3>Vente de véhicule</h3>
            <p>Commission sur chaque vente réalisée via la plateforme.</p>
            <div className={styles.commissionExample}>
              <span>Ex. : 10 000 000 FCFA de vente</span>
              <span>→ Votre net : <strong>9 699 000 FCFA</strong></span>
              <small>(10 000 000 − 300 000 commission − 1 000 frais service)</small>
            </div>
          </div>
          <div className={styles.commissionCard} style={{ background: "#f8fafc" }}>
            <div className={styles.commissionRate} style={{ background: "#6366f1", fontSize: "1.4rem" }}>
              1 000 FCFA
            </div>
            <h3>Frais de service</h3>
            <p>Frais fixe prélevé sur chaque réservation confirmée, quelle que soit la valeur.</p>
            <div className={styles.commissionExample}>
              <span>Couvre la gestion des contrats,</span>
              <span>la caution & le support client.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className={styles.plansSection}>
        <h2>Choisissez votre plan</h2>
        {successMsg && <div className={styles.successBanner}>{successMsg}</div>}
        <div className={styles.plansGrid}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`${styles.planCard} ${plan.badge ? styles.planCardFeatured : ""}`}
              style={{ "--accent": plan.color }}
            >
              {plan.badge && <div className={styles.planBadge}>{plan.badge}</div>}
              <div className={styles.planHeader}>
                <h3>{plan.name}</h3>
                <div className={styles.planPrice}>
                  {plan.price === 0 ? (
                    <span className={styles.planFree}>Gratuit</span>
                  ) : (
                    <>
                      <span className={styles.planAmount}>{fmt(plan.price)}</span>
                      <span className={styles.planPeriod}> / mois</span>
                    </>
                  )}
                </div>
              </div>
              <ul className={styles.planFeatures}>
                {plan.features.map((f, i) => (
                  <li key={i} className={f.ok ? styles.featureOk : styles.featureNo}>
                    <span>{f.ok ? "✓" : "✗"}</span> {f.text}
                  </li>
                ))}
              </ul>
              <button
                className={`${styles.planCta} ${plan.ctaDisabled ? styles.planCtaDisabled : ""}`}
                disabled={plan.ctaDisabled || activating}
                onClick={plan.id === "pro" ? handleActivatePro : undefined}
              >
                {activating && plan.id === "pro" ? "Activation..." : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Boosts ── */}
      <section className={styles.boostsSection}>
        <h2>Mettre en avant une annonce</h2>
        <p>Achetez un boost ponctuel pour n'importe laquelle de vos annonces.</p>
        <div className={styles.boostsGrid}>
          {BOOSTS.map((b) => (
            <div key={b.id} className={styles.boostCard}>
              <span className={styles.boostIcon}>{b.icon}</span>
              <div className={styles.boostInfo}>
                <h3>{b.name}</h3>
                <p>{b.description}</p>
              </div>
              <div className={styles.boostPrice}>
                <strong>{fmt(b.price)}</strong>
                <button
                  className={styles.boostBtn}
                  onClick={() => isAuthenticated ? navigate("/vendor/dashboard") : navigate("/login")}
                >
                  Acheter
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sécurité & Confiance ── */}
      <section className={styles.trustSection}>
        <h2>Sécurité & Confiance</h2>
        <div className={styles.trustGrid}>
          <div className={styles.trustCard}>
            <span>🪪</span>
            <h3>Vérification d'identité</h3>
            <p>Chaque locataire fournit une pièce d'identité (CNI ou passeport) avant toute réservation.</p>
          </div>
          <div className={styles.trustCard}>
            <span>💼</span>
            <h3>Caution de 200 000 FCFA</h3>
            <p>Un dépôt de garantie est systématiquement prélevé à la réservation et restitué à la restitution.</p>
          </div>
          <div className={styles.trustCard}>
            <span>📄</span>
            <h3>Contrat digital</h3>
            <p>Un contrat de location officiel est généré automatiquement et signé électroniquement.</p>
          </div>
          <div className={styles.trustCard}>
            <span>🎧</span>
            <h3>Support client 24h/7j</h3>
            <p>Notre équipe est disponible en permanence pour régler tout litige ou urgence.</p>
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className={styles.finalCta}>
        <h2>Prêt à publier votre première annonce ?</h2>
        <p>Rejoignez des centaines de vendeurs et loueurs qui font confiance à VIT AUTO.</p>
        <div className={styles.finalBtns}>
          <button className={styles.btnPrimary} onClick={() => navigate("/vendor")}>
            Publier une annonce
          </button>
          <button className={styles.btnSecondary} onClick={() => navigate("/catalogue")}>
            Voir le catalogue
          </button>
        </div>
      </section>
    </div>
  );
}
