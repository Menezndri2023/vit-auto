import React from "react";
import { Link } from "react-router-dom";

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 40 }}>
    <h2 style={{
      fontSize: "1rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
      borderLeft: "4px solid #ff4d2d", paddingLeft: 14, lineHeight: 1.35,
    }}>
      {title}
    </h2>
    <div style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.8, paddingLeft: 4 }}>
      {children}
    </div>
  </div>
);

const Li = ({ children }) => (
  <li style={{ marginBottom: 6, display: "flex", gap: 8 }}>
    <span style={{ color: "#ff4d2d", flexShrink: 0, marginTop: 2 }}>›</span>
    <span>{children}</span>
  </li>
);

export default function Cookies() {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "36px 36px 32px", marginBottom: 24, color: "#fff",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>🍪 COOKIES & TRACEURS</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Politique Cookies
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          Dernière mise à jour : Juillet 2026 · VIT AUTO · vit-auto.com
        </p>
      </div>

      <div style={{
        background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12,
        padding: "14px 18px", marginBottom: 40, fontSize: "0.85rem", color: "#92400e",
      }}>
        ⚠️ <strong>Document rédigé le 2026-07-16, à faire valider par un juriste avant toute
        communication officielle.</strong> Le contenu ci-dessous décrit fidèlement ce que fait
        réellement le site à cette date — il devra être tenu à jour à chaque ajout de traceur.
      </div>

      <Section title="1. Ce que VIT AUTO n'utilise pas">
        <p>
          À la date de rédaction de cette politique, VIT AUTO <strong>n'installe aucun cookie de mesure d'audience,
          publicitaire ou de suivi tiers</strong> (pas de Google Analytics, Meta Pixel, TikTok Pixel ou équivalent).
          Aucun bandeau de consentement cookies n'est donc affiché — il n'y a rien de non essentiel à consentir aujourd'hui.
        </p>
      </Section>

      <Section title="2. Ce que VIT AUTO utilise réellement">
        <p>
          Le site utilise le <strong>stockage local de votre navigateur</strong> (localStorage), une technologie proche des
          cookies mais gérée différemment (elle ne transite pas automatiquement avec chaque requête réseau). Ce qui y est stocké :
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li><strong>Session de connexion</strong> — jeton d'authentification (JWT) et jeton de rafraîchissement, pour rester connecté</Li>
          <Li><strong>Préférence de devise</strong> — la devise choisie ou détectée pour l'affichage des prix</Li>
          <Li><strong>Préférence de pays du catalogue</strong> — le pays sélectionné pour filtrer les annonces</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          Ces éléments sont <strong>strictement nécessaires</strong> au fonctionnement du site (rester connecté, afficher les bons
          prix) — ils ne servent ni au suivi publicitaire, ni à la revente à des tiers.
        </p>
      </Section>

      <Section title="3. Cookies techniques tiers (hébergement)">
        <p>
          Nos prestataires d'hébergement et de paiement peuvent déposer leurs propres cookies techniques nécessaires à leur
          fonctionnement (ex. anti-fraude Stripe lors d'un paiement par carte). Ces cookies sont gérés directement par ces
          prestataires selon leur propre politique — VIT AUTO n'y a pas accès et ne les exploite pas.
        </p>
      </Section>

      <Section title="4. Vos choix">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li>Vous pouvez supprimer le contenu du stockage local à tout moment depuis les réglages de votre navigateur — cela vous déconnectera du site</Li>
          <Li>Bloquer le stockage local peut empêcher certaines fonctionnalités de fonctionner correctement (connexion, préférences de devise)</Li>
        </ul>
      </Section>

      <Section title="5. Évolution de cette politique">
        <p>
          Si VIT AUTO ajoute à l'avenir des outils de mesure d'audience ou des traceurs publicitaires, cette page sera mise à
          jour et un bandeau de consentement sera ajouté <strong>avant</strong> toute activation, conformément à la réglementation
          applicable (RGPD / directive ePrivacy pour les utilisateurs européens).
        </p>
      </Section>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Politique de confidentialité
        </Link>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 Conditions générales d'utilisation
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ Nous contacter
        </a>
      </div>
    </div>
  );
}
