import { Link } from "react-router-dom";

const Li = ({ children }) => (
  <li style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
    <span style={{ color: "#ff4d2d", flexShrink: 0, fontSize: "1rem" }}>✓</span>
    <span style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.6 }}>{children}</span>
  </li>
);

const BenefitCard = ({ icon, title, desc }) => (
  <div style={{
    background: "#fff", border: "1px solid #e8edf5", borderRadius: 16,
    padding: "28px 24px", textAlign: "center", boxShadow: "0 2px 12px rgba(15,27,63,.06)",
    transition: "transform .2s, box-shadow .2s",
  }}>
    <div style={{ fontSize: "2.2rem", marginBottom: 14 }}>{icon}</div>
    <h3 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 800, color: "#0f1b3f" }}>{title}</h3>
    <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem", lineHeight: 1.65 }}>{desc}</p>
  </div>
);

const STEPS = [
  { n: "1", title: "Créez votre compte", desc: "Inscription gratuite en 2 minutes avec vos informations partenaire.", icon: "📝" },
  { n: "2", title: "Soumettez vos véhicules", desc: "Publiez vos annonces avec photos, prix et disponibilités.", icon: "🚗" },
  { n: "3", title: "Recevez des réservations", desc: "Les clients réservent directement. Vous confirmez ou refusez en un clic.", icon: "📥" },
  { n: "4", title: "Encaissez en sécurité", desc: "Paiements sécurisés, contrats digitaux automatiques, virements rapides.", icon: "💳" },
];

export default function Partenaires() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 60%, #ff4d2d22 100%)",
        borderRadius: 24, padding: "46px 40px 42px", marginBottom: 50, color: "#fff",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 200, height: 200,
          background: "rgba(255,77,45,.12)", borderRadius: "50%",
        }} />
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.22)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16,
        }}>🤝 PROGRAMME PARTENAIRES VIT AUTO</span>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(1.6rem,3vw,2.3rem)", fontWeight: 900, lineHeight: 1.2 }}>
          Rejoignez la plateforme automobile<br />
          <span style={{ color: "#ff6b4a" }}>qui propulse vos revenus</span>
        </h1>
        <p style={{ margin: "0 0 26px", color: "rgba(255,255,255,.92)", fontSize: "0.97rem", maxWidth: 540, lineHeight: 1.65 }}>
          Agences, concessionnaires, particuliers — publiez vos véhicules sur VIT AUTO
          et touchez des milliers de clients dans 20+ pays. Commission transparente, paiements sécurisés.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.45)", display: "inline-block",
          }}>
            Devenir partenaire →
          </Link>
          <a href="#offre-fondateur" style={{
            background: "rgba(255,255,255,.12)", color: "#fff", fontWeight: 700, fontSize: "0.92rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.25)", display: "inline-block",
          }}>
            Voir l'Offre Fondateur ⭐
          </a>
        </div>
      </div>

      {/* ── Offre Fondateur ── */}
      <div id="offre-fondateur" style={{
        background: "linear-gradient(135deg, #fffbf0 0%, #fff7ed 100%)",
        border: "2px solid #fbbf24", borderRadius: 22, padding: "36px 34px",
        marginBottom: 48, position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: "#fbbf24", color: "#7c2d12", fontWeight: 900,
          fontSize: "0.72rem", padding: "7px 18px", borderRadius: "0 22px 0 14px",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          ⭐ OFFRE LIMITÉE
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: "2rem" }}>👑</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "clamp(1.2rem,2.2vw,1.65rem)", fontWeight: 900, color: "#0f1b3f" }}>
              Offre Fondateur
            </h2>
            <p style={{ margin: "3px 0 0", color: "#92400e", fontWeight: 700, fontSize: "0.85rem" }}>
              Réservée aux 20 premiers partenaires inscrits
            </p>
          </div>
        </div>

        <p style={{ color: "#78350f", fontSize: "0.9rem", lineHeight: 1.65, marginBottom: 26, maxWidth: 580 }}>
          En tant que partenaire fondateur, vous bénéficiez d'avantages exclusifs pendant 12 mois,
          d'une visibilité prioritaire et d'un accès anticipé à toutes les futures fonctionnalités.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16, marginBottom: 28 }}>
          {[
            { icon: "🎁", label: "Gratuit 12 mois", desc: "Aucun abonnement, aucune carte requise pendant un an complet." },
            { icon: "💸", label: "Commission réduite", desc: "Location : 10 % · Vente : 2 % (au lieu de 15 % et 3 %)." },
            { icon: "🏅", label: "Badge Fondateur", desc: "Mention exclusive \"Partenaire Fondateur\" sur toutes vos annonces." },
            { icon: "📢", label: "Mise en avant permanente", desc: "Vos annonces apparaissent en premier dans le catalogue et les recherches." },
            { icon: "🔓", label: "Accès anticipé", desc: "Accès prioritaire aux nouvelles fonctionnalités avant tous les autres." },
          ].map((item) => (
            <div key={item.label} style={{
              background: "#fff", border: "1px solid #fde68a", borderRadius: 14,
              padding: "18px 16px", boxShadow: "0 2px 8px rgba(251,191,36,.12)",
            }}>
              <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.9rem", marginBottom: 5 }}>{item.label}</div>
              <div style={{ color: "#78350f", fontSize: "0.82rem", lineHeight: 1.55 }}>{item.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire&plan=fondateur" style={{
            background: "#f59e0b", color: "#fff", fontWeight: 900, fontSize: "0.95rem",
            padding: "13px 30px", borderRadius: 11, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(245,158,11,.4)", display: "inline-block",
          }}>
            Réclamer mon offre Fondateur →
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "flex", gap: -8, alignItems: "center",
            }}>
              {["👤","👤","👤"].map((u, i) => (
                <span key={i} style={{
                  display: "inline-flex", width: 32, height: 32, background: "#fde68a",
                  borderRadius: "50%", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem", border: "2px solid #fff",
                  marginLeft: i === 0 ? 0 : -8,
                }}>{u}</span>
              ))}
            </div>
            <span style={{ color: "#92400e", fontSize: "0.85rem", fontWeight: 700 }}>
              Places restantes limitées — agissez vite
            </span>
          </div>
        </div>
      </div>

      {/* ── Avantages ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.7rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 8,
      }}>
        Pourquoi choisir VIT AUTO ?
      </h2>
      <p style={{ textAlign: "center", color: "#64748b", marginBottom: 36, fontSize: "0.95rem" }}>
        Des outils professionnels pour développer votre activité
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 20, marginBottom: 56 }}>
        <BenefitCard icon="🌍" title="Présence internationale" desc="20+ pays, 9 devises. Chine, Dubaï, Europe, Afrique, Maghreb — touchez des clients partout." />
        <BenefitCard icon="📄" title="Contrats digitaux" desc="Chaque réservation génère automatiquement un contrat à valeur légale." />
        <BenefitCard icon="🚚" title="Livraison GPS" desc="Calcul automatique des frais de livraison. Plus de négociation." />
        <BenefitCard icon="💳" title="Paiements sécurisés" desc="Orange Money, Wave, MTN, carte bancaire. Virement rapide vers vous." />
        <BenefitCard icon="📊" title="Tableau de bord" desc="Statistiques en temps réel : vues, réservations, revenus." />
        <BenefitCard icon="🔒" title="Vérification clients" desc="Identité et téléphone vérifiés. Réduisez les risques d'impayé." />
      </div>

      {/* ── Types de partenaires ── */}
      <div style={{
        background: "#f8fafc", borderRadius: 20, padding: "40px 36px", marginBottom: 56,
      }}>
        <h2 style={{ margin: "0 0 28px", fontSize: "1.3rem", fontWeight: 900, color: "#0f1b3f" }}>
          Qui peut devenir partenaire ?
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16 }}>
          {[
            { icon: "🏢", title: "Agences de location", desc: "Multipliez vos canaux de réservation et automatisez votre gestion." },
            { icon: "🏪", title: "Concessionnaires & Importateurs", desc: "Vendez neuf et occasion à une audience qualifiée dans 20+ pays. Importez depuis la Chine ou Dubaï via Import/Export." },
            { icon: "👤", title: "Particuliers", desc: "Monétisez votre véhicule quand vous ne l'utilisez pas." },
            { icon: "👨‍✈️", title: "Chauffeurs professionnels", desc: "Proposez vos services avec conducteur à des clients partout." },
          ].map((t) => (
            <div key={t.title} style={{
              background: "#fff", borderRadius: 14, padding: "22px 20px",
              border: "1px solid #e2e8f0",
            }}>
              <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>{t.icon}</div>
              <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.95rem", marginBottom: 6 }}>{t.title}</div>
              <div style={{ color: "#64748b", fontSize: "0.86rem", lineHeight: 1.6 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comment ça marche ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.7rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 36,
      }}>
        Comment ça marche ?
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 20, marginBottom: 56 }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ textAlign: "center" }}>
            <div style={{
              width: 52, height: 52, background: "#0f1b3f", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px", fontSize: "1.1rem", fontWeight: 900, color: "#fff",
            }}>{s.n}</div>
            <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{s.icon}</div>
            <h3 style={{ margin: "0 0 8px", fontWeight: 800, color: "#0f1b3f", fontSize: "0.95rem" }}>{s.title}</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.86rem", lineHeight: 1.6 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Commissions ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "40px 36px", marginBottom: 56, color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 8px", fontWeight: 900, fontSize: "1.3rem", color: "#ffffff", textShadow: "0 2px 16px rgba(0,0,0,.4)" }}>Commissions transparentes</h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.92)", fontSize: "0.9rem" }}>
          Aucun frais caché. Vous savez exactement ce que vous payez.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 16 }}>
          {[
            { label: "Location", standard: "15 %", founder: "10 %", icon: "🚗", note: "Ex. 500 DH → 75 DH commission" },
            { label: "Vente", standard: "3 %", founder: "2 %", icon: "🏷️", note: "Ex. 100 000 DH → 3 000 DH commission" },
            { label: "Chauffeur", standard: "10 %", founder: "10 %", icon: "👨‍✈️", note: "Ex. 300 DH → 30 DH commission" },
            { label: "Assurance", standard: "Négociée", founder: "Négociée", icon: "🛡️", note: "Selon accord partenaire" },
            { label: "Frais service client", standard: "15 DH fixe", founder: "15 DH fixe", icon: "⚙️", note: "À la charge du client" },
          ].map((c) => (
            <div key={c.label} style={{
              background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "22px 20px",
              border: "1px solid rgba(255,255,255,.12)",
            }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 12 }}>{c.label}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,.85)", fontSize: "0.82rem" }}>Standard</span>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{c.standard}</span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between",
                background: "rgba(255,215,0,.15)", borderRadius: 8, padding: "6px 10px",
              }}>
                <span style={{ color: "#ffd700", fontSize: "0.82rem", fontWeight: 700 }}>👑 Fondateur</span>
                <span style={{ color: "#ffd700", fontWeight: 900, fontSize: "0.9rem" }}>{c.founder}</span>
              </div>
              {c.note && <div style={{ color: "rgba(255,255,255,.70)", fontSize: "0.76rem", marginTop: 8 }}>{c.note}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Conditions partenaires ── */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16,
        padding: "28px 28px", marginBottom: 40,
      }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 800, color: "#0f1b3f", fontSize: "1rem" }}>
          Ce que vous devez fournir
        </h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li>Pièce d'identité valide (CNI ou passeport)</Li>
          <Li>Numéro de téléphone vérifié pour les notifications</Li>
          <Li>Adresse exacte du véhicule (indispensable pour le calcul GPS de livraison)</Li>
          <Li>Photos réelles et récentes des véhicules publiés</Li>
          <Li>Documents en règle : assurance, carte grise, contrôle technique</Li>
          <Li>Disponibilité pour confirmer les réservations dans les 24 heures</Li>
        </ul>
      </div>

      {/* ── Import / Export ── */}
      <div style={{
        background: "linear-gradient(135deg, #0a1429 0%, #0f1b3f 100%)",
        borderRadius: 20, padding: "36px 36px", marginBottom: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 28, flexWrap: "wrap", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -50, right: -50, width: 180, height: 180,
          background: "rgba(255,77,45,.07)", borderRadius: "50%",
        }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <span style={{
            display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff7a5c",
            fontSize: "0.70rem", fontWeight: 800, padding: "4px 12px",
            borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12,
          }}>🌍 SERVICE EXCLUSIF</span>
          <h3 style={{ margin: "0 0 10px", fontWeight: 900, color: "#fff", fontSize: "clamp(1.1rem,2vw,1.4rem)" }}>
            Import / Export International
          </h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,.92)", fontSize: "0.88rem", lineHeight: 1.65, maxWidth: 460 }}>
            Importez des véhicules depuis la Chine, Dubaï ou l'Europe et revendez-les sur 20+ marchés.
            Inspection, transport maritime, dédouanement — VIT AUTO gère tout avec vous.
          </p>
        </div>
        <Link to="/import-export" style={{
          background: "linear-gradient(135deg, #ff4d2d, #e03519)", color: "#fff",
          fontWeight: 800, fontSize: "0.90rem", padding: "13px 26px",
          borderRadius: 11, textDecoration: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 18px rgba(255,77,45,.35)", flexShrink: 0,
        }}>
          Découvrir Import/Export →
        </Link>
      </div>

      {/* ── CTA final ── */}
      <div style={{
        textAlign: "center", background: "linear-gradient(135deg, #ff4d2d, #ff6b4a)",
        borderRadius: 20, padding: "48px 32px", color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 12px", fontWeight: 900, fontSize: "clamp(1.3rem,2.5vw,1.8rem)" }}>
          Prêt à rejoindre VIT AUTO ?
        </h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.8)", fontSize: "0.95rem" }}>
          L'inscription est gratuite. L'Offre Fondateur est limitée aux 20 premiers.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire&plan=fondateur" style={{
            background: "#fff", color: "#ff4d2d", fontWeight: 900, fontSize: "0.95rem",
            padding: "14px 32px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,.2)", display: "inline-block",
          }}>
            Démarrer gratuitement →
          </Link>
          <Link to="/conditions-partenaires" style={{
            background: "rgba(255,255,255,.15)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.3)", display: "inline-block",
          }}>
            Lire les conditions partenaires
          </Link>
        </div>
      </div>

    </div>
  );
}
