import React from "react";
import { Link } from "react-router-dom";

const Art = ({ n, title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: "1rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{
        background: "#ff4d2d", color: "#fff", fontSize: "0.74rem",
        fontWeight: 900, padding: "3px 10px", borderRadius: 999, flexShrink: 0,
        marginTop: 2,
      }}>{n}</span>
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

export default function CGU() {
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
        }}>📄 CONDITIONS D'UTILISATION</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Conditions Générales d'Utilisation
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          En vigueur depuis le 1er Janvier 2026 · VIT AUTO · Casablanca, Maroc
        </p>
      </div>

      <Art n="1" title="Objet et acceptation">
        <p>
          Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme
          <strong> VIT AUTO</strong>, accessible à <em>vit-auto.com</em> et ses applications mobiles.
          En créant un compte ou en utilisant les services, vous acceptez intégralement les présentes CGU.
        </p>
      </Art>

      <Art n="2" title="Description des services">
        <p>VIT AUTO est une plateforme de mise en relation entre :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li><strong>Clients</strong> — personnes souhaitant louer, acheter ou tester un véhicule</Li>
          <Li><strong>Partenaires</strong> — agences, concessionnaires ou particuliers proposant des véhicules</Li>
          <Li><strong>Chauffeurs</strong> — professionnels proposant un service avec conducteur</Li>
        </ul>
        <p style={{ marginTop: 10 }}>VIT AUTO agit comme intermédiaire et n'est pas propriétaire des véhicules proposés.</p>
      </Art>

      <Art n="3" title="Inscription et compte">
        <p>
          L'accès complet nécessite la création d'un compte avec : nom, email valide, numéro de téléphone vérifié.
          Les partenaires doivent fournir une pièce d'identité et une <strong>adresse exacte</strong> (obligatoire pour le calcul GPS de livraison).
          Vous êtes seul responsable de la confidentialité de votre mot de passe.
        </p>
      </Art>

      <Art n="4" title="Commandes et réservations">
        <p>Toute réservation confirmée constitue un contrat entre le client et le partenaire. VIT AUTO génère automatiquement un contrat digital. Le client s'engage à :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Restituer le véhicule à la date et en l'état convenu</Li>
          <Li>Payer la caution prévue au moment de la réservation</Li>
          <Li>Signaler tout incident dans les 24 heures</Li>
          <Li>Respecter les conditions d'âge et de permis de l'annonce</Li>
          <Li>Fournir une adresse de livraison précise (GPS ou texte) si livraison à domicile demandée</Li>
        </ul>
      </Art>

      <Art n="5" title="Système de livraison géolocalisée 🚚">
        <p>
          VIT AUTO propose une <strong>livraison à domicile calculée automatiquement</strong> par algorithme GPS (Haversine).
          Les frais sont : <strong>15 DH de base + 3 DH/km</strong> de distance réelle entre le partenaire et le client.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Le client partage sa position GPS (avec consentement) lors de la réservation</Li>
          <Li>Le partenaire doit renseigner son adresse exacte lors de la publication</Li>
          <Li>La distance et les frais sont calculés et affichés avant la confirmation du paiement</Li>
          <Li>La livraison est assurée par le partenaire, seul responsable du bon déroulement</Li>
        </ul>
      </Art>

      <Art n="6" title="Commissions et frais">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li><strong>Location :</strong> 15 % du montant (10 % pour les Partenaires Fondateurs)</Li>
          <Li><strong>Vente :</strong> 3 % du prix de vente (2 % pour les Partenaires Fondateurs)</Li>
          <Li><strong>Chauffeur :</strong> 10 % du montant de la course</Li>
          <Li><strong>Frais de service :</strong> 15 DH fixes par réservation, à la charge du client</Li>
          <Li><strong>Livraison GPS :</strong> 15 DH de base + 3 DH/km, calculée dynamiquement, à la charge du client</Li>
          <Li><strong>Assurance / Crédit / Leasing :</strong> commissions négociées avec les partenaires concernés</Li>
        </ul>
      </Art>

      <Art n="7" title="Obligations des partenaires">
        <p>Les partenaires s'engagent à :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Fournir des informations exactes sur les véhicules (photos réelles, état, kilométrage)</Li>
          <Li>Renseigner l'<strong>adresse exacte</strong> pour le calcul précis des frais de livraison GPS</Li>
          <Li>Confirmer ou refuser chaque réservation dans les 24 heures</Li>
          <Li>Assurer la disponibilité du véhicule aux dates confirmées</Li>
          <Li>Maintenir leurs documents, assurance et contrôle technique en règle</Li>
          <Li>Effectuer la livraison à l'adresse GPS communiquée par le client</Li>
        </ul>
      </Art>

      <Art n="8" title="Responsabilité">
        <p>
          VIT AUTO est une plateforme d'intermédiation. Sa responsabilité se limite à la mise en relation et au calcul des frais.
          VIT AUTO ne saurait être tenu responsable des dommages résultant de l'utilisation des véhicules,
          d'accidents, de retards de livraison ou de tout litige entre client et partenaire.
        </p>
      </Art>

      <Art n="9" title="Propriété intellectuelle">
        <p>
          L'ensemble des éléments de la plateforme (logo, design, code, textes, algorithmes)
          sont la propriété exclusive de VIT AUTO et protégés par le droit marocain et international.
          Toute reproduction est interdite sans autorisation écrite préalable.
        </p>
      </Art>

      <Art n="10" title="Droit applicable et litiges">
        <p>
          Les présentes CGU sont soumises au <strong>droit marocain</strong>.
          En cas de litige, une solution amiable sera privilegiée. À défaut, les tribunaux compétents de Casablanca seront saisis.
        </p>
        <p style={{ marginTop: 12 }}>
          Contact :{" "}
          <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>contact@vit-auto.com</a>
          {" "}·{" "}
          <a href="tel:+2120607742672" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>+212 06 07 74 26 72</a>
        </p>
      </Art>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Politique de confidentialité
        </Link>
        <Link to="/faq" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ❓ FAQ
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ Nous contacter
        </a>
      </div>
    </div>
  );
}
