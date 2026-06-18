import React from "react";

const Art = ({ n, title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f1b3f", marginBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ background: "#ff4d2d", color: "#fff", fontSize: "0.78rem", fontWeight: 900, padding: "2px 9px", borderRadius: 999, flexShrink: 0 }}>{n}</span>
      {title}
    </h2>
    <div style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.75, paddingLeft: 4 }}>{children}</div>
  </div>
);

export default function CGU() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: "clamp(1.6rem,2.5vw,2.2rem)", fontWeight: 900, color: "#0f1b3f", margin: "0 0 8px" }}>
          Conditions Générales d'Utilisation
        </h1>
        <p style={{ color: "#8493b0", fontSize: "0.85rem" }}>En vigueur depuis le 1er Janvier 2026 · VIT AUTO · Casablanca, Maroc</p>
      </div>

      <Art n="1" title="Objet et acceptation">
        <p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme VIT AUTO (ci-après « la Plateforme »), accessible à vit-auto.com et ses applications mobiles. En créant un compte ou en utilisant les services, vous acceptez intégralement les présentes CGU.</p>
      </Art>

      <Art n="2" title="Description des services">
        <p>VIT AUTO est une plateforme de mise en relation entre :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li><strong>Clients</strong> — personnes souhaitant louer ou acheter un véhicule</li>
          <li><strong>Partenaires</strong> — agences, concessionnaires, particuliers proposant des véhicules</li>
          <li><strong>Chauffeurs</strong> — professionnels proposant un service avec conducteur</li>
        </ul>
        <p style={{ marginTop: 10 }}>VIT AUTO agit comme intermédiaire et n'est pas propriétaire des véhicules proposés.</p>
      </Art>

      <Art n="3" title="Inscription et compte">
        <p>L'accès complet nécessite la création d'un compte avec : nom, email valide, numéro de téléphone vérifié par SMS. Les partenaires doivent en outre fournir une pièce d'identité vérifiée. Vous êtes responsable de la confidentialité de votre mot de passe.</p>
      </Art>

      <Art n="4" title="Commandes et réservations">
        <p>Toute réservation confirmée constitue un contrat entre le client et le partenaire. VIT AUTO génère automatiquement un contrat digital. Le client s'engage à :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li>Restituer le véhicule à la date et en l'état convenu</li>
          <li>Payer la caution prévue au moment de la réservation</li>
          <li>Signaler tout incident dans les 24 heures</li>
          <li>Respecter les conditions d'âge et de permis de l'annonce</li>
        </ul>
      </Art>

      <Art n="5" title="Système de livraison géolocalisée">
        <p>VIT AUTO propose une livraison à domicile calculée automatiquement en fonction de la distance GPS entre le partenaire et le client. Les frais (1 000 FCFA de base + 200 FCFA/km) sont informatifs et peuvent être ajustés par accord entre les parties. La livraison est assurée par le partenaire, qui reste seul responsable du bon déroulement.</p>
      </Art>

      <Art n="6" title="Commissions et frais">
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <li><strong>Location :</strong> 15 % du montant de base (10 % pour les Partenaires Fondateurs)</li>
          <li><strong>Vente :</strong> 3 % du prix de vente (2 % pour les Partenaires Fondateurs)</li>
          <li><strong>Frais de service :</strong> fixe par réservation (15 MAD / 1 000 FCFA)</li>
        </ul>
      </Art>

      <Art n="7" title="Obligations des partenaires">
        <p>Les partenaires s'engagent à :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li>Fournir des informations exactes sur les véhicules (photos, état, kilométrage)</li>
          <li>Renseigner l'adresse exacte du véhicule pour le calcul de livraison</li>
          <li>Confirmer ou refuser chaque réservation dans les 24 heures</li>
          <li>Assurer la disponibilité du véhicule aux dates confirmées</li>
          <li>Maintenir leurs documents et assurances en règle</li>
        </ul>
      </Art>

      <Art n="8" title="Responsabilité">
        <p>VIT AUTO est une plateforme d'intermédiation. Sa responsabilité se limite à la mise en relation. VIT AUTO ne saurait être tenu responsable des dommages résultant de l'utilisation des véhicules, des accidents, ou de tout litige entre client et partenaire.</p>
      </Art>

      <Art n="9" title="Propriété intellectuelle">
        <p>L'ensemble des éléments de la Plateforme (logo, design, code, textes) sont la propriété exclusive de VIT AUTO et protégés par le droit marocain et international de la propriété intellectuelle. Toute reproduction est interdite sans autorisation écrite.</p>
      </Art>

      <Art n="10" title="Droit applicable et litiges">
        <p>Les présentes CGU sont soumises au droit marocain. En cas de litige, une solution amiable sera privilégiée. À défaut, les tribunaux compétents de Casablanca seront saisis.<br /><br />
        Contact : <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d" }}>contact@vit-auto.com</a> · +212 0607742672</p>
      </Art>
    </div>
  );
}
