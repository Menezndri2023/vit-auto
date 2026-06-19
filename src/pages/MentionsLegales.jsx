import { Link } from "react-router-dom";

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: "1rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
      borderLeft: "4px solid #ff4d2d", paddingLeft: 14,
    }}>
      {title}
    </h2>
    <div style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.8, paddingLeft: 4 }}>
      {children}
    </div>
  </div>
);

const Row = ({ label, value }) => (
  <div style={{
    display: "flex", gap: 12, padding: "10px 0",
    borderBottom: "1px solid #f1f5f9", flexWrap: "wrap",
  }}>
    <span style={{ color: "#94a3b8", fontSize: "0.85rem", minWidth: 180, flexShrink: 0 }}>{label}</span>
    <span style={{ color: "#0f1b3f", fontSize: "0.9rem", fontWeight: 600 }}>{value}</span>
  </div>
);

export default function MentionsLegales() {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "36px 36px 32px", marginBottom: 44, color: "#fff",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>⚖️ INFORMATIONS LÉGALES</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Mentions légales
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          Conformément aux dispositions légales en vigueur · VIT AUTO · vit-auto.com
        </p>
      </div>

      <Section title="1. Éditeur de la plateforme">
        <Row label="Dénomination" value="VIT AUTO" />
        <Row label="Forme juridique" value="Entreprise individuelle / Startup" />
        <Row label="Siège social" value="Route 1029, Hay Sidi Maârouf 1, 20520 Casablanca, Maroc" />
        <Row label="Email de contact" value="contact@vit-auto.com" />
        <Row label="Téléphone" value="+212 06 07 74 26 72" />
        <Row label="Directeur de publication" value="VIT AUTO" />
      </Section>

      <Section title="2. Hébergement">
        <Row label="Frontend" value="Vercel Inc. — 340 Pine Street, Suite 701, San Francisco, CA 94104, USA" />
        <Row label="Backend / API" value="Railway Corp. — San Francisco, CA, USA" />
        <Row label="Base de données" value="MongoDB Atlas — MongoDB Inc., New York, USA" />
        <p style={{ marginTop: 14 }}>
          Les serveurs sont hébergés dans des datacenters certifiés ISO 27001 avec chiffrement TLS 1.3.
        </p>
      </Section>

      <Section title="3. Activité de la plateforme">
        <p>
          VIT AUTO est une plateforme numérique de mise en relation entre des clients souhaitant louer,
          acheter ou tester un véhicule, et des partenaires (agences, concessionnaires, particuliers)
          proposant des véhicules ou des services de chauffeur.
        </p>
        <p style={{ marginTop: 10 }}>
          VIT AUTO agit en qualité d'<strong>intermédiaire</strong> et n'est pas propriétaire des véhicules
          proposés sur la plateforme. VIT AUTO ne peut être tenu responsable des transactions directes
          entre clients et partenaires au-delà du cadre de la mise en relation.
        </p>
      </Section>

      <Section title="4. Propriété intellectuelle">
        <p>
          L'ensemble des éléments constituant la plateforme VIT AUTO — y compris, sans s'y limiter :
          le nom de marque, le logo, le design, les maquettes, les textes, les algorithmes,
          le code source et les bases de données — sont la propriété exclusive de VIT AUTO
          et sont protégés par le droit marocain de la propriété intellectuelle et les conventions internationales.
        </p>
        <p style={{ marginTop: 10 }}>
          Toute reproduction, représentation, modification, publication, adaptation ou exploitation,
          totale ou partielle, par quelque procédé que ce soit, est strictement interdite
          sans autorisation écrite préalable de VIT AUTO.
        </p>
      </Section>

      <Section title="5. Cookies">
        <p>
          La plateforme utilise uniquement des cookies <strong>strictement nécessaires</strong> à son fonctionnement
          (gestion de session, préférences de langue et de devise).
          Aucun cookie publicitaire ou de traçage tiers n'est installé sans votre consentement explicite.
        </p>
      </Section>

      <Section title="6. Limitation de responsabilité">
        <p>
          VIT AUTO s'efforce d'assurer la disponibilité et l'exactitude des informations publiées sur la plateforme.
          Toutefois, VIT AUTO ne saurait être tenu responsable :
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
          {[
            "Des interruptions temporaires de service pour maintenance ou cas de force majeure",
            "Des inexactitudes dans les annonces publiées par des partenaires tiers",
            "Des dommages résultant de l'utilisation des véhicules ou de litiges entre client et partenaire",
            "De l'accès à des sites externes liés depuis la plateforme",
          ].map((item, i) => (
            <li key={i} style={{ marginBottom: 8, display: "flex", gap: 8 }}>
              <span style={{ color: "#ff4d2d", flexShrink: 0 }}>›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="7. Droit applicable et juridiction">
        <p>
          Les présentes mentions légales sont régies par le <strong>droit marocain</strong>.
          En cas de litige relatif à l'utilisation de la plateforme, une résolution amiable sera privilégiée.
          À défaut, les tribunaux compétents de <strong>Casablanca, Maroc</strong> auront juridiction exclusive.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>Pour toute question relative aux présentes mentions légales :</p>
        <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <a href="mailto:contact@vit-auto.com" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 700, fontSize: "0.88rem",
            padding: "10px 20px", borderRadius: 10, textDecoration: "none",
          }}>
            ✉️ contact@vit-auto.com
          </a>
          <a href="tel:+2120607742672" style={{
            background: "#f8fafc", color: "#0f1b3f", fontWeight: 700, fontSize: "0.88rem",
            padding: "10px 20px", borderRadius: 10, textDecoration: "none",
            border: "1px solid #e2e8f0",
          }}>
            📞 +212 06 07 74 26 72
          </a>
        </div>
      </Section>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 Conditions d'utilisation
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Politique de confidentialité
        </Link>
        <Link to="/conditions-partenaires" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🤝 Conditions partenaires
        </Link>
      </div>
    </div>
  );
}
