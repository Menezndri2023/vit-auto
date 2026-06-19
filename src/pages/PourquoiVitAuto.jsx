import { Link } from "react-router-dom";

const SERVICE_CARDS = [
  {
    icon: "🚗",
    color: "#6366f1",
    bg: "rgba(99,102,241,.08)",
    title: "Location",
    desc: "Courte ou longue durée, à la journée ou au mois. Plus de 500 véhicules disponibles dans 14 pays. Tarifs transparents, pas de surprises.",
    cta: "Voir les locations",
    link: "/catalogue?mode=Louer",
  },
  {
    icon: "💰",
    color: "#10b981",
    bg: "rgba(16,185,129,.08)",
    title: "Vente",
    desc: "Achetez un véhicule neuf ou d'occasion en toute sécurité. Contrat digital, vérification du vendeur, paiement sécurisé inclus.",
    cta: "Voir les ventes",
    link: "/catalogue?mode=Acheter",
  },
  {
    icon: "👨‍✈️",
    color: "#f59e0b",
    bg: "rgba(245,158,11,.08)",
    title: "Chauffeur",
    desc: "Réservez un chauffeur professionnel vérifié pour vos transferts, mariages, événements ou déplacements quotidiens.",
    cta: "Trouver un chauffeur",
    link: "/catalogue?mode=Chauffeur",
  },
  {
    icon: "🛡️",
    color: "#ff4d2d",
    bg: "rgba(255,77,45,.08)",
    title: "Assurance",
    desc: "Chaque réservation inclut une couverture de base. Options d'assurance complémentaires disponibles pour plus de tranquillité.",
    cta: "En savoir plus",
    link: "/services",
  },
  {
    icon: "🏦",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,.08)",
    title: "Crédit & Leasing",
    desc: "Accédez à la propriété sans payer comptant. Apport réduit, mensualités flexibles, contrat électronique à valeur légale.",
    cta: "Voir les offres leasing",
    link: "/catalogue?mode=Acheter",
  },
  {
    icon: "🔍",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,.08)",
    title: "Inspection",
    desc: "Avant tout achat, faites inspecter le véhicule par nos experts partenaires. Rapport complet, état réel garanti.",
    cta: "Demander une inspection",
    link: "/services",
  },
  {
    icon: "🚚",
    color: "#f59e0b",
    bg: "rgba(245,158,11,.08)",
    title: "Livraison GPS",
    desc: "Votre véhicule livré à votre porte. Calcul automatique des frais par GPS Haversine. 15 DH de base + 3 DH/km.",
    cta: "Réserver avec livraison",
    link: "/catalogue",
    highlight: true,
  },
];

const STATS = [
  { value: "14", label: "pays couverts", icon: "🌍" },
  { value: "8", label: "devises acceptées", icon: "💱" },
  { value: "500+", label: "véhicules disponibles", icon: "🚗" },
  { value: "24h", label: "support client", icon: "💬" },
];

const WHY_ITEMS = [
  { icon: "📄", title: "Contrats digitaux automatiques", desc: "Chaque réservation génère un contrat signable en ligne, à valeur légale, sans paperasse." },
  { icon: "✅", title: "Identités vérifiées", desc: "Partenaires et chauffeurs sont vérifiés avant toute publication. Vous traitez avec des professionnels contrôlés." },
  { icon: "💳", title: "Paiements 100 % sécurisés", desc: "Orange Money, Wave, MTN, Stripe, carte bancaire. Vos transactions sont chiffrées et protégées." },
  { icon: "🌐", title: "Plateforme multilingue", desc: "Interface en Français, Anglais et Arabe. Support des devises locales pour 14 pays." },
  { icon: "📊", title: "Transparence totale des prix", desc: "Frais de service, commission, livraison — tout est affiché avant la confirmation. Zéro surprise." },
  { icon: "🏅", title: "Garantie satisfaction", desc: "En cas de problème, notre équipe intervient et trouve une solution sous 24 heures." },
];

export default function PourquoiVitAuto() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 24, padding: "52px 44px 48px", marginBottom: 60, color: "#fff",
        textAlign: "center",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.2)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "5px 16px",
          borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20,
        }}>🏆 PLATEFORME TOUT-EN-UN</span>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontWeight: 900, lineHeight: 1.25 }}>
          Pourquoi choisir VIT AUTO ?
        </h1>
        <p style={{ margin: "0 auto 32px", color: "rgba(255,255,255,.75)", fontSize: "1.05rem", maxWidth: 580, lineHeight: 1.7 }}>
          Location, vente, chauffeur, assurance, crédit, inspection et livraison —
          <strong style={{ color: "#fff" }}> tout sur une seule plateforme</strong>, dans 14 pays.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/catalogue" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "13px 28px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.4)", display: "inline-block",
          }}>
            Explorer le catalogue →
          </Link>
          <Link to="/register" style={{
            background: "rgba(255,255,255,.12)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "13px 24px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.25)", display: "inline-block",
          }}>
            Créer un compte gratuit
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
        gap: 16, marginBottom: 60,
      }}>
        {STATS.map((s) => (
          <div key={s.label} style={{
            background: "#fff", border: "1px solid #e8edf5", borderRadius: 16,
            padding: "24px 20px", textAlign: "center",
            boxShadow: "0 2px 12px rgba(15,27,63,.06)",
          }}>
            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#ff4d2d", lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Services ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.8rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 8,
      }}>
        Tous vos besoins automobiles, un seul endroit
      </h2>
      <p style={{ textAlign: "center", color: "#64748b", marginBottom: 36, fontSize: "0.95rem" }}>
        Fini les va-et-vient entre plusieurs prestataires. VIT AUTO regroupe tout.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))",
        gap: 20, marginBottom: 60,
      }}>
        {SERVICE_CARDS.map((s) => (
          <div key={s.title} style={{
            background: "#fff", border: s.highlight ? `2px solid ${s.color}` : "1px solid #e8edf5",
            borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden",
            boxShadow: s.highlight ? `0 4px 20px ${s.color}22` : "0 2px 10px rgba(15,27,63,.05)",
          }}>
            {s.highlight && (
              <div style={{
                position: "absolute", top: 12, right: 14,
                background: s.color, color: "#fff", fontSize: "0.68rem",
                fontWeight: 800, padding: "3px 10px", borderRadius: 99,
              }}>NOUVEAU ⚡</div>
            )}
            <div style={{
              width: 52, height: 52, background: s.bg, borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.6rem", marginBottom: 16,
            }}>{s.icon}</div>
            <h3 style={{ margin: "0 0 10px", fontWeight: 800, color: "#0f1b3f", fontSize: "1.05rem" }}>{s.title}</h3>
            <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.65 }}>{s.desc}</p>
            <Link to={s.link} style={{
              color: s.color, fontWeight: 700, fontSize: "0.85rem",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              {s.cta} <span>→</span>
            </Link>
          </div>
        ))}
      </div>

      {/* ── Avantages différenciants ── */}
      <div style={{
        background: "#f8fafc", borderRadius: 24, padding: "44px 36px", marginBottom: 56,
      }}>
        <h2 style={{ margin: "0 0 8px", fontWeight: 900, color: "#0f1b3f", fontSize: "clamp(1.2rem,2.5vw,1.6rem)" }}>
          Ce qui nous différencie
        </h2>
        <p style={{ margin: "0 0 32px", color: "#64748b", fontSize: "0.9rem" }}>
          VIT AUTO n'est pas qu'un site d'annonces. C'est une infrastructure complète pour la mobilité.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 20 }}>
          {WHY_ITEMS.map((w) => (
            <div key={w.title} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              padding: "22px 20px", display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{
                width: 44, height: 44, background: "rgba(255,77,45,.08)", borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem", flexShrink: 0,
              }}>{w.icon}</div>
              <div>
                <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.92rem", marginBottom: 6 }}>{w.title}</div>
                <div style={{ color: "#64748b", fontSize: "0.84rem", lineHeight: 1.6 }}>{w.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparaison ── */}
      <div style={{ marginBottom: 56 }}>
        <h2 style={{ fontWeight: 900, color: "#0f1b3f", marginBottom: 24, fontSize: "clamp(1.2rem,2.5vw,1.5rem)" }}>
          VIT AUTO vs. la concurrence
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#0f1b3f", color: "#fff" }}>
                <th style={{ padding: "14px 18px", textAlign: "left", borderRadius: "12px 0 0 0" }}>Fonctionnalité</th>
                <th style={{ padding: "14px 18px", textAlign: "center", color: "#ff8060" }}>VIT AUTO</th>
                <th style={{ padding: "14px 18px", textAlign: "center", borderRadius: "0 12px 0 0", color: "rgba(255,255,255,.5)" }}>Concurrents</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Location + Vente + Chauffeur", true, false],
                ["Livraison GPS calculée auto", true, false],
                ["Contrat digital automatique", true, false],
                ["14 pays, 8 devises", true, false],
                ["Vérification identité partenaires", true, true],
                ["Paiement mobile (Orange, Wave…)", true, false],
                ["Interface FR / EN / AR", true, false],
              ].map(([feat, vitAuto, concurr], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ padding: "13px 18px", color: "#0f1b3f", fontWeight: 600 }}>{feat}</td>
                  <td style={{ padding: "13px 18px", textAlign: "center", color: vitAuto ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: "1.1rem" }}>
                    {vitAuto ? "✓" : "✗"}
                  </td>
                  <td style={{ padding: "13px 18px", textAlign: "center", color: concurr ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: "1.1rem" }}>
                    {concurr ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{
        textAlign: "center", background: "linear-gradient(135deg, #0f1b3f, #1e3a6e)",
        borderRadius: 20, padding: "48px 32px", color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 12px", fontWeight: 900, fontSize: "clamp(1.3rem,2.5vw,1.8rem)" }}>
          Prêt à démarrer ?
        </h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.7)", fontSize: "0.95rem" }}>
          Rejoignez des milliers d'utilisateurs qui font confiance à VIT AUTO pour leur mobilité.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/catalogue" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "14px 30px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.4)", display: "inline-block",
          }}>
            Voir le catalogue →
          </Link>
          <Link to="/partenaires" style={{
            background: "rgba(255,255,255,.1)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "14px 26px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.25)", display: "inline-block",
          }}>
            Devenir partenaire
          </Link>
        </div>
      </div>

    </div>
  );
}
